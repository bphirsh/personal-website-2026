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

const require = createRequire(import.meta.url);
const handler = require('../api/invite-reply.js');

process.env.RESEND_API_KEY = 'test-key-not-real';
process.env.NOTIFY_EMAIL = 'brian@example.test';

let sent = [];
globalThis.fetch = async (url, init) => {
  sent.push({ url, body: JSON.parse(init.body) });
  return { ok: true, text: async () => '' };
};

async function call(method, body) {
  sent = [];
  let status = 0;
  let json = null;
  const res = {
    setHeader() {},
    status(s) { status = s; return this; },
    json(j) { json = j; return this; },
  };
  await handler({ method, body }, res);
  return { status, json, sent };
}

const tool = (id, known = true) => ({ id: known ? id : 'other', label: id, known });
const page = replyBody({
  invite: '91-q7m2', platform: 'mac-apple-silicon', role: 'coder',
  ai_tools: [tool('claude-code'), tool('cursor'), tool('Zed assistant', false)],
  knowledge_tools: [tool('obsidian')],
}, '');

const cases = [
  ['the page body, no email', 'POST', page, (r) => r.status === 201 && r.sent.length === 1 && !('reply_to' in r.sent[0].body)],
  ['the page body has exactly five fields', null, page, () => Object.keys(page).sort().join() === 'ai_tools,invite,knowledge_tools,platform,role'],
  ['with a typed email: six fields, Reply-To set', 'POST', replyBody({ ...page, ai_tools: [], knowledge_tools: [] }, 'sam@example.test'), (r) => r.status === 201 && r.sent[0].body.reply_to === 'sam@example.test'],
  ['the sample: invite none', 'POST', { ...page, invite: 'none' }, (r) => r.status === 201 && r.sent[0].body.subject.includes('none')],
  ['extra fields are ignored, never emailed', 'POST', { ...page, name: 'Secret Name', file: '# Page: private' }, (r) => r.status === 201 && !JSON.stringify(r.sent).includes('Secret Name') && !JSON.stringify(r.sent).includes('private')],
  ['HTML in a tool is escaped', 'POST', { ...page, ai_tools: ['<b>x</b>'] }, (r) => r.status === 201 && r.sent[0].body.html.includes('&lt;b&gt;x&lt;/b&gt;')],
  ['a bad code is refused', 'POST', { ...page, invite: 'k3f9-07' }, (r) => r.status === 400 && r.sent.length === 0],
  ['an unasked platform is refused', 'POST', { ...page, platform: 'unknown' }, (r) => r.status === 400 && r.sent.length === 0],
  ['a bad email is refused', 'POST', { ...page, email: 'not-an-email' }, (r) => r.status === 400 && r.sent.length === 0],
  ['too many tools are refused', 'POST', { ...page, ai_tools: Array(21).fill('x') }, (r) => r.status === 400 && r.sent.length === 0],
  ['a string body is parsed', 'POST', JSON.stringify(page), (r) => r.status === 201],
  ['GET is refused', 'GET', null, (r) => r.status === 405 && r.sent.length === 0],
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
console.log('\nWhat Resend would be asked to send, with a typed email:');
console.log(JSON.stringify({ ...shown.sent[0].body, html: '(the same rows, as a table)' }, null, 2));

console.log(`\n${cases.length - failed} pass, ${failed} fail`);
process.exit(failed ? 1 : 0);
