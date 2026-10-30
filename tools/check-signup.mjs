#!/usr/bin/env node
/**
 * check-signup — run /api/signup locally with the email stubbed out, so nothing is sent anywhere.
 *
 *   node tools/check-signup.mjs
 *
 * It loads api/signup.js as Vercel would, replaces global fetch with a recorder, and calls the handler with made-up requests: the request-access page's body (an email since M-027, with the computer and agents), older pages' bodies, values the endpoint must refuse, and Resend failing at each step of the beta list (api/_beta-list.js). Each case says PASS or FAIL; exit 1 on any FAIL. What it cannot see: Vercel's own body parsing and Resend itself, which only a real send shows.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const handler = require('../api/signup.js');

process.env.RESEND_API_KEY = 'test-key-not-real';
process.env.NOTIFY_EMAIL = 'brian@example.test';
process.env.RESEND_FROM = 'Brian Hirsh <brian@example.test>';
process.env.RESEND_AUDIENCE_ID = 'seg-test';

// Every call to Resend is recorded in `calls`; `sent` is the notification to Brian alone. `failing(call)` says which calls Resend refuses in a case.
let calls = [];
let sent = [];
let failing = () => false;
globalThis.fetch = async (url, init) => {
  const c = { url: url.replace('https://api.resend.com', ''), method: init.method, body: init.body ? JSON.parse(init.body) : null };
  calls.push(c);
  if (c.url === '/emails' && c.body.to[0] === 'brian@example.test') sent.push(c);
  const bad = failing(c);
  return { ok: !bad, status: bad ? 422 : 200, text: async () => (bad ? 'refused in the check' : '') };
};

async function call(body, fail = () => false) {
  sent = [];
  calls = [];
  failing = fail;
  let status = 0;
  const res = { setHeader() {}, status(s) { status = s; return this; }, json() { return this; } };
  await handler({ method: 'POST', body }, res);
  return { status, sent, calls };
}

const confirmTo = (r, email) => r.calls.find((c) => c.url === '/emails' && c.body.to[0] === email);
const created = (r) => r.calls.filter((c) => c.url === '/contacts' && c.method === 'POST');

// The body the page sends (workspace/signup/index.html), with made-up values.
const page = { name: 'Sam Q. Test', email: 'sam@example.test', computer: 'mac-apple-silicon', agents: ['claude', 'cursor'] };

const cases = [
  ['the page body is sent, with computer and agents in the email', page, (r) => r.status === 201 && r.sent.length === 1 && r.sent[0].body.text.includes('Computer: Mac with Apple silicon') && r.sent[0].body.text.includes('Agents: Claude, Cursor')],
  ['no agents is fine (optional)', { ...page, agents: [] }, (r) => r.status === 201 && r.sent[0].body.text.includes('Agents: (none)')],
  ['an old-style request, without either field, still works', { name: 'Sam Test', contact: 'sam@example.test', contact_kind: 'email' }, (r) => r.status === 201 && r.sent[0].body.text.includes('Computer: (not said)')],
  ['a phone alone is refused now (M-027)', { ...page, email: undefined, contact: '+1 555 123 4567', contact_kind: 'phone' }, (r) => r.status === 400 && r.calls.length === 0],
  ['no email is refused', { ...page, email: '' }, (r) => r.status === 400 && r.calls.length === 0],
  // The beta list (M-027, 30 Oct 2026).
  ['they join the Beta segment, named, with computer and agents as properties', page, (r) => {
    const c = created(r)[0];
    return c && c.body.email === 'sam@example.test' && c.body.first_name === 'Sam' && c.body.last_name === 'Q. Test'
      && c.body.segments[0].id === 'seg-test' && c.body.properties.computer === 'mac-apple-silicon' && c.body.properties.agents === 'claude,cursor';
  }],
  ['no agents: the property is left out, not blanked', { ...page, agents: [] }, (r) => !('agents' in created(r)[0].body.properties)],
  ['the confirmation goes to them, by first name, from RESEND_FROM', page, (r) => {
    const c = confirmTo(r, 'sam@example.test');
    return c && c.body.from === 'Brian Hirsh <brian@example.test>' && c.body.text.startsWith('Hi Sam,') && c.body.html.includes('Hi Sam,') && !c.body.html.includes('{{name}}');
  }],
  ['a name with HTML is escaped in the confirmation', { ...page, name: '<i>Sam</i>' }, (r) => confirmTo(r, 'sam@example.test').body.html.includes('Hi &lt;i&gt;Sam&lt;/i&gt;,')],
  ["Brian's email says both worked, Reply-To them", page, (r) => r.sent[0].body.text.includes('Beta list: on the list (added)') && r.sent[0].body.text.includes('Confirmation: sent') && r.sent[0].body.reply_to === 'sam@example.test' && !r.sent[0].body.subject.includes('check')],
  ['properties not created yet: they are created and the contact written again', page,
    (r) => r.status === 201 && created(r).length === 2 && r.calls.filter((c) => c.url === '/contact-properties').map((c) => c.body.key).join() === 'computer,agents',
    // The first create fails, as Resend does for an unknown property; the second succeeds.
    ((n) => (c) => c.url === '/contacts' && c.method === 'POST' && n++ === 0)(0)],
  ['already a contact: updated by email and added to the segment, no duplicate', page, (r) => {
    const patch = r.calls.find((c) => c.method === 'PATCH');
    const seg = r.calls.find((c) => c.url === '/contacts/sam%40example.test/segments/seg-test');
    return r.status === 201 && patch.url === '/contacts/sam%40example.test' && patch.body.properties.agents === 'claude,cursor' && patch.body.first_name === 'Sam'
      && seg && r.sent[0].body.text.includes('already a contact, updated') && confirmTo(r, 'sam@example.test');
  }, (c) => c.url === '/contacts' && c.method === 'POST'],
  ["the list fails: no confirmation, Brian's email says what failed, the sign-up still succeeds", page,
    (r) => r.status === 201 && !confirmTo(r, 'sam@example.test') && r.sent[0].body.text.includes('Beta list: FAILED: create 422 refused in the check') && r.sent[0].body.subject.includes('(check the list)'),
    (c) => c.url.startsWith('/contacts')],
  ["the confirmation fails: Brian's email says so", page,
    (r) => r.status === 201 && r.sent[0].body.text.includes('Confirmation: FAILED: 422'),
    (c) => c.url === '/emails' && c.body.to[0] === 'sam@example.test'],
  ["Brian's email fails but they are on the list: still a success", page, (r) => r.status === 201,
    (c) => c.url === '/emails' && c.body.to[0] === 'brian@example.test'],
  ['everything fails: an error, so they can try again', page, (r) => r.status === 502, () => true],
  ['an unknown computer is refused', { ...page, computer: 'amiga' }, (r) => r.status === 400 && r.calls.length === 0],
  ['an unknown agent is refused', { ...page, agents: ['claude', 'skynet'] }, (r) => r.status === 400 && r.sent.length === 0],
  ['agents that are not a list are refused', { ...page, agents: 'claude' }, (r) => r.status === 400 && r.sent.length === 0],
  ['too many agents are refused', { ...page, agents: Array(9).fill('claude') }, (r) => r.status === 400 && r.sent.length === 0],
  ['a repeated agent is sent once', { ...page, agents: ['claude', 'claude'] }, (r) => r.status === 201 && r.sent[0].body.text.includes('Agents: Claude\n') && created(r)[0].body.properties.agents === 'claude'],
  ['a prototype key is not a computer', { ...page, computer: 'toString' }, (r) => r.status === 400 && r.sent.length === 0],
  ['HTML in the name is escaped', { ...page, name: '<b>x</b>' }, (r) => r.status === 201 && r.sent[0].body.html.includes('&lt;b&gt;x&lt;/b&gt;')],
  ['the honeypot still drops silently, joining nothing', { ...page, website: 'spam' }, (r) => r.status === 201 && r.calls.length === 0],
];

let failed = 0;
for (const [name, body, ok, fail] of cases) {
  const r = await call(body, fail);
  const pass = ok(r);
  if (!pass) failed++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  → ${r.status}`);
}

console.log('\nThe body the page sends:');
console.log(JSON.stringify(page));
const shown = await call(page);
console.log('\nThe text Resend would be asked to send:');
console.log(shown.sent[0].body.text);
console.log('The confirmation they would get:');
console.log(confirmTo(shown, page.email).body.text);

console.log(`${cases.length - failed} pass, ${failed} fail`);
process.exit(failed ? 1 : 0);
