#!/usr/bin/env node
/**
 * check-invite-reply — run /api/invite-reply locally with the email stubbed
 * out, so nothing is sent anywhere.
 *
 *   node tools/check-invite-reply.mjs
 *
 * It loads api/invite-reply.js as Vercel would, replaces global fetch with a
 * recorder, and calls the handler with made-up replies: what Resend would
 * have been asked to send is printed, and each case says PASS or FAIL. Exit 1
 * on any FAIL. What it cannot see: Vercel's own body parsing and Resend
 * itself, which only a preview deploy shows.
 */

import { createRequire } from 'node:module';
import { replyBody } from '../workspace/try/button.js';
import { codeFromHash } from '../workspace/try/invite.js';

const require = createRequire(import.meta.url);
const handler = require('../api/invite-reply.js');

process.env.RESEND_API_KEY = 'test-key-not-real';
process.env.NOTIFY_EMAIL = 'brian@example.test';
process.env.RESEND_FROM = 'Brian Hirsh <brian@example.test>';
process.env.RESEND_AUDIENCE_ID = 'seg-test';

// Every call to Resend is recorded in `calls`; `sent` is the notification to Brian alone, as before the beta list (M-027).
let calls = [];
let sent = [];
globalThis.fetch = async (url, init) => {
  const call = { url, method: init.method, body: init.body ? JSON.parse(init.body) : null };
  calls.push(call);
  if (url.endsWith('/emails') && call.body.to[0] === 'brian@example.test') sent.push(call);
  return { ok: true, status: 200, text: async () => '' };
};

async function call(method, body) {
  sent = [];
  calls = [];
  let status = 0;
  let json = null;
  const res = {
    setHeader() {},
    status(s) { status = s; return this; },
    json(j) { json = j; return this; },
  };
  await handler({ method, body }, res);
  return { status, json, sent, calls };
}

const tool = (id, known = true) => ({ id: known ? id : 'other', label: id, known });
const page = replyBody({
  invite: '91-q7m2', platform: 'mac-apple-silicon', role: 'coder',
  ai_tools: [tool('claude-code'), tool('cursor'), tool('Zed assistant', false)],
  knowledge_tools: [tool('obsidian')],
}, 'priya@example.test');

const cases = [
  ['the page body: six fields, the email among them', null, page, () => Object.keys(page).sort().join() === 'ai_tools,email,invite,knowledge_tools,platform,role'],
  // Since 27 Oct 2026 the page sends role only when the file said one.
  ['a file with no role: role is left out of the body', null, null, () => !('role' in replyBody({ ...page, role: null }, 'a@b.test'))],
  ['no role is accepted, and the email says so', 'POST', (({ role, ...rest }) => rest)(page), (r) => r.status === 201 && r.sent[0].body.html.includes('(not said)')],
  ['a role that is not ours is refused', 'POST', { ...page, role: 'wizard' }, (r) => r.status === 400 && r.sent.length === 0],
  ['the page body is sent, Reply-To their email', 'POST', page, (r) => r.status === 201 && r.sent.length === 1 && r.sent[0].body.reply_to === 'priya@example.test'],
  ['no email is refused (M-013)', 'POST', (({ email, ...rest }) => rest)(page), (r) => r.status === 400 && r.sent.length === 0],
  ['an empty email is refused', 'POST', { ...page, email: '  ' }, (r) => r.status === 400 && r.sent.length === 0],
  ['the sample: invite none', 'POST', { ...page, invite: 'none' }, (r) => r.status === 201 && r.sent[0].body.subject.includes('none')],
  ['extra fields are ignored, never emailed', 'POST', { ...page, name: 'Secret Name', file: '# Page: private' }, (r) => r.status === 201 && !JSON.stringify(r.sent).includes('Secret Name') && !JSON.stringify(r.sent).includes('private')],
  ['HTML in a tool is escaped', 'POST', { ...page, ai_tools: ['<b>x</b>'] }, (r) => r.status === 201 && r.sent[0].body.html.includes('&lt;b&gt;x&lt;/b&gt;')],
  ['a bad code is refused', 'POST', { ...page, invite: 'k3f9-07' }, (r) => r.status === 400 && r.sent.length === 0],
  ['an unasked platform is refused', 'POST', { ...page, platform: 'unknown' }, (r) => r.status === 400 && r.sent.length === 0],
  ['a bad email is refused', 'POST', { ...page, email: 'not-an-email' }, (r) => r.status === 400 && r.sent.length === 0],
  ['too many tools are refused', 'POST', { ...page, ai_tools: Array(21).fill('x') }, (r) => r.status === 400 && r.sent.length === 0],
  ['a string body is parsed', 'POST', JSON.stringify(page), (r) => r.status === 201],
  ['GET is refused', 'GET', null, (r) => r.status === 405 && r.sent.length === 0],
  // The beta list (M-027, 30 Oct 2026).
  ['they join the Beta segment with computer and agents as properties', 'POST', page, (r) => {
    const c = r.calls.find((x) => x.url.endsWith('/contacts') && x.method === 'POST');
    return c && c.body.email === 'priya@example.test' && c.body.segments[0].id === 'seg-test'
      && c.body.properties.computer === 'mac-apple-silicon' && c.body.properties.agents === 'claude-code,cursor,Zed assistant';
  }],
  ['they get the confirmation, "Hi there" since no name is asked', 'POST', page, (r) => {
    const c = r.calls.find((x) => x.url.endsWith('/emails') && x.body.to[0] === 'priya@example.test');
    return c && c.body.subject === "You're on the Workspace beta list" && c.body.text.startsWith('Hi there,') && !c.body.html.includes('{{name}}');
  }],
  ["Brian's email says both worked", 'POST', page, (r) => r.sent[0].body.text.includes('Beta list: on the list (added)') && r.sent[0].body.text.includes('Confirmation: sent')],
  ['a refused body touches no contact', 'POST', { ...page, email: 'nope' }, (r) => r.calls.length === 0],
  // The code from the link (M-010): a bad # is no code, never an error.
  ...[['#07-k3f9', '07-k3f9'], ['#07-K3F9', '07-k3f9'], ['#07%2Dk3f9', '07-k3f9'], ['', null], ['#junk', null],
    ['#100%', null], ['#%E0%A4%A', null], ['#%', null], ['#07-k3f9%', null]]
    .map(([hash, want]) => [`codeFromHash(${JSON.stringify(hash)}) is ${JSON.stringify(want)}`, null, null, () => {
      try { return codeFromHash(hash) === want; } catch { return false; }
    }]),
];

let failed = 0;
for (const [name, method, body, ok] of cases) {
  const r = method ? await call(method, body) : {};
  const pass = ok(r);
  if (!pass) failed++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${method ? `  → ${r.status}` : ''}`);
}

console.log('\nThe body the page sends for ok-coder-mac:');
console.log(JSON.stringify(page, null, 2));
const shown = await call('POST', replyBody({ ...page, ai_tools: [tool('claude-code')], knowledge_tools: [tool('obsidian')] }, 'sam@example.test'));
console.log('\nWhat Resend would be asked to send:');
console.log(JSON.stringify({ ...shown.sent[0].body, html: '(the same rows, as a table)' }, null, 2));

console.log(`\n${cases.length - failed} pass, ${failed} fail`);
process.exit(failed ? 1 : 0);
