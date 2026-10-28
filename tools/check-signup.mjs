#!/usr/bin/env node
/**
 * check-signup — run /api/signup locally with the email stubbed out, so nothing is sent anywhere.
 *
 *   node tools/check-signup.mjs
 *
 * It loads api/signup.js as Vercel would, replaces global fetch with a recorder, and calls the handler with made-up requests: the request-access page's new body (with the computer and agents, 28 Oct 2026), the old page's body without them, and values the endpoint must refuse. Each case says PASS or FAIL; exit 1 on any FAIL. What it cannot see: Vercel's own body parsing and Resend itself, which only a real send shows.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const handler = require('../api/signup.js');

process.env.RESEND_API_KEY = 'test-key-not-real';
process.env.NOTIFY_EMAIL = 'brian@example.test';

let sent = [];
globalThis.fetch = async (url, init) => {
  sent.push({ url, body: JSON.parse(init.body) });
  return { ok: true, text: async () => '' };
};

async function call(body) {
  sent = [];
  let status = 0;
  const res = { setHeader() {}, status(s) { status = s; return this; }, json() { return this; } };
  await handler({ method: 'POST', body }, res);
  return { status, sent };
}

// The body the page sends (workspace/signup/index.html), with made-up values.
const page = { name: 'Sam Test', contact: 'sam@example.test', contact_kind: 'email', computer: 'mac-apple-silicon', agents: ['claude', 'cursor'] };

const cases = [
  ['the page body is sent, with computer and agents in the email', page, (r) => r.status === 201 && r.sent.length === 1 && r.sent[0].body.text.includes('Computer: Mac with Apple silicon') && r.sent[0].body.text.includes('Agents: Claude, Cursor')],
  ['no agents is fine (optional)', { ...page, agents: [] }, (r) => r.status === 201 && r.sent[0].body.text.includes('Agents: (none)')],
  ['an old-style request, without either field, still works', { name: 'Sam Test', contact: 'sam@example.test', contact_kind: 'email' }, (r) => r.status === 201 && r.sent[0].body.text.includes('Computer: (not said)')],
  ['an unknown computer is refused', { ...page, computer: 'amiga' }, (r) => r.status === 400 && r.sent.length === 0],
  ['an unknown agent is refused', { ...page, agents: ['claude', 'skynet'] }, (r) => r.status === 400 && r.sent.length === 0],
  ['agents that are not a list are refused', { ...page, agents: 'claude' }, (r) => r.status === 400 && r.sent.length === 0],
  ['too many agents are refused', { ...page, agents: Array(9).fill('claude') }, (r) => r.status === 400 && r.sent.length === 0],
  ['a repeated agent is sent once', { ...page, agents: ['claude', 'claude'] }, (r) => r.status === 201 && r.sent[0].body.text.includes('Agents: Claude\n')],
  ['a prototype key is not a computer', { ...page, computer: 'toString' }, (r) => r.status === 400 && r.sent.length === 0],
  ['HTML in the name is escaped', { ...page, name: '<b>x</b>' }, (r) => r.status === 201 && r.sent[0].body.html.includes('&lt;b&gt;x&lt;/b&gt;')],
  ['the honeypot still drops silently', { ...page, website: 'spam' }, (r) => r.status === 201 && r.sent.length === 0],
];

let failed = 0;
for (const [name, body, ok] of cases) {
  const r = await call(body);
  const pass = ok(r);
  if (!pass) failed++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  → ${r.status}`);
}

console.log('\nThe body the page sends:');
console.log(JSON.stringify(page));
const shown = await call(page);
console.log('\nThe text Resend would be asked to send:');
console.log(shown.sent[0].body.text);

console.log(`${cases.length - failed} pass, ${failed} fail`);
process.exit(failed ? 1 : 0);
