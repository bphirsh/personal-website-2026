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
import { HEADLINES, pickHeadline, headlineFrom } from '../workspace/try/headline.js';
import { fillPrompt } from '../workspace/try/getfile.js';

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
    return c && c.body.subject === 'Your Workspace download link' && c.body.text.startsWith('Hi there,') && !c.body.html.includes('{{name}}');
  }],
  ["Brian's email says both worked", 'POST', page, (r) => r.sent[0].body.text.includes('Beta list: on the list (added)') && r.sent[0].body.text.includes('Confirmation: sent')],
  ['a refused body touches no contact', 'POST', { ...page, email: 'nope' }, (r) => r.calls.length === 0],
  // Event-tagged links (3 Nov 2026).
  ['no event: none in the body, the property, or the confirmation', 'POST', page, (r) => {
    const c = r.calls.find((x) => x.url.endsWith('/contacts') && x.method === 'POST');
    const conf = r.calls.find((x) => x.url.endsWith('/emails') && x.body.to[0] === 'priya@example.test');
    return !('event' in page) && !('event' in c.body.properties) && !conf.body.text.includes('Great to meet you') && r.sent[0].body.text.includes('Event: (none)');
  }],
  ['the page sends the event only when its address had one', null, null, () => replyBody({ ...page, ai_tools: [], knowledge_tools: [], event: 'ai-tinkerers-nov' }, 'a@b.test').event === 'ai-tinkerers-nov'],
  ['with an event: saved on the contact, named in the confirmation and my email', 'POST', { ...page, event: 'ai-tinkerers-nov' }, (r) => {
    const c = r.calls.find((x) => x.url.endsWith('/contacts') && x.method === 'POST');
    const conf = r.calls.find((x) => x.url.endsWith('/emails') && x.body.to[0] === 'priya@example.test');
    return r.status === 201 && c.body.properties.event === 'ai-tinkerers-nov'
      && conf.body.text.startsWith('Hi there,\n\nGreat to meet you at AI Tinkerers! Thanks for signing up') && conf.body.html.includes('Great to meet you at AI Tinkerers! Thanks for signing up')
      && r.sent[0].body.text.includes('Event: AI Tinkerers (ai-tinkerers-nov)');
  }],
  // Two landing headlines, counted by sign-ups (3 Nov 2026).
  ['the page sends the headline it showed', null, null, () => replyBody({ ...page, ai_tools: [], knowledge_tools: [], headline: 'b' }, 'a@b.test').headline === 'b' && !('headline' in page)],
  ['with a headline: saved on the contact and in my email', 'POST', { ...page, headline: 'a' }, (r) => {
    const c = r.calls.find((x) => x.url.endsWith('/contacts') && x.method === 'POST');
    return r.status === 201 && c.body.properties.headline === 'a' && r.sent[0].body.text.includes('Headline: a');
  }],
  ['no headline: no property, "Headline: (none)"', 'POST', page, (r) => {
    const c = r.calls.find((x) => x.url.endsWith('/contacts') && x.method === 'POST');
    return r.status === 201 && !('headline' in c.body.properties) && r.sent[0].body.text.includes('Headline: (none)');
  }],
  ...[['c'], ['A'], ['<b>'], [1], [['a']]].map(([h]) => [`a headline of ${JSON.stringify(h)} is dropped, never refused`, 'POST', { ...page, headline: h }, (r) => {
    const c = r.calls.find((x) => x.url.endsWith('/contacts') && x.method === 'POST');
    return r.status === 201 && !('headline' in c.body.properties) && r.sent[0].body.text.includes('Headline: (none)');
  }]),
  ['the two headlines are Brian\'s picks, and a visit gets either', null, null, () => HEADLINES.a.startsWith('Find out what your AI agent') && HEADLINES.b.startsWith('Your agent already knows')
    && pickHeadline(() => 0) === 'a' && pickHeadline(() => 0.49) === 'a' && pickHeadline(() => 0.5) === 'b' && pickHeadline(() => 0.99) === 'b'],
  // The return visit (amended 3 Nov 2026): the copied prompt's link carries the headline and event back.
  ...[['?h=a', 'a'], ['?h=b', 'b'], ['?h=b&event=ai-tinkerers-nov', 'b'], ['', null], ['?h=c', null], ['?h=A', null], ['?h=toString', null], ['?event=x', null]]
    .map(([q, want]) => [`headlineFrom(${JSON.stringify(q)}) is ${JSON.stringify(want)}`, null, null, () => headlineFrom(q) === want]),
  ['a return visit with ?h=b sends b', 'POST', replyBody({ ...page, ai_tools: [], knowledge_tools: [], headline: headlineFrom('?h=b') ?? pickHeadline(() => 0) }, 'sam@example.test'), (r) => {
    const c = r.calls.find((x) => x.url.endsWith('/contacts') && x.method === 'POST');
    return r.status === 201 && c.body.properties.headline === 'b' && r.sent[0].body.text.includes('Headline: b');
  }],
  ["the copied prompt's link carries the headline and event, before the #code", null, null, () => {
    const p = fillPrompt('90-test', undefined, { headline: 'b', event: 'ai-tinkerers-nov' });
    return p.includes('https://www.brianhirsh.com/workspace/try?h=b&event=ai-tinkerers-nov#90-test') && (p.match(/90-test/g) || []).length === 3;
  }],
  ['without a code, the link carries them with no #', null, null, () => {
    const p = fillPrompt(null, undefined, { headline: 'a' });
    return p.includes('https://www.brianhirsh.com/workspace/try?h=a ') && !/workspace\/try[^ ]*#/.test(p) && !/[{}]/.test(p);
  }],
  ['with nothing to carry, the link is as before', null, null, () => fillPrompt('90-test').includes('https://www.brianhirsh.com/workspace/try#90-test') && fillPrompt(null).includes('https://www.brianhirsh.com/workspace/try ')],
  ['a bad event is dropped, never refused', 'POST', { ...page, event: '<script>' }, (r) => {
    const c = r.calls.find((x) => x.url.endsWith('/contacts') && x.method === 'POST');
    return r.status === 201 && !('event' in c.body.properties) && !JSON.stringify(r.calls).includes('script');
  }],
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
