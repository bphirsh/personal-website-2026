#!/usr/bin/env node
/**
 * check-pages — read the site's own files and check the public download tells one story (row "Make the download public across the site", 9 Nov 2026).
 *
 *   node tools/check-pages.mjs
 *
 * Nothing is served or fetched: it reads the HTML and the scripts as they are in the repository. It checks that every Workspace page reaches the download in one click, that the download page has no password and its button goes through /api/download, what the download page's new-build box sends to /api/signup, that the password endpoint is gone and the old URL still redirects, and that no page, meta text or email still talks about requesting access, passwords, Open Anyway, onboarding, being on a list or waiting for a turn. Each case says PASS or FAIL; exit 1 on any FAIL. What it cannot see: how the pages look and behave in a browser.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const PAGES = ['index.html', '404.html', 'workspace/index.html', 'workspace/signup/index.html', 'workspace/try/index.html', 'workspace/download/index.html'];
const WORKSPACE_PAGES = PAGES.filter((p) => p.startsWith('workspace/'));
const download = read('workspace/download/index.html');
const confirmation = require_('api/_confirmation.js');

function require_(p) {
  const m = { exports: {} };
  new Function('module', 'exports', read(p))(m, m.exports);
  return m.exports;
}

// The words a visitor must no longer meet. "onboarding@resend.dev" is Resend's sender name, not copy; "off the list" is how to unsubscribe.
const STALE = /request(ed)? access|password|open anyway|onboard(?!ing@resend\.dev)|on the list|your turn|get invited|invites? go out|for invited testers|reserve my spot|you're in line/i;

/** The new-build box's request body, as written in the download page's script. */
const boxBody = (download.match(/fetch\('\/api\/signup',[\s\S]*?body: JSON\.stringify\((\{[\s\S]*?\})\),/) || [])[1] || '';

const cases = [
  ...WORKSPACE_PAGES.map((p) => [`${p} links to the download in one click`, () => /href="\/workspace\/download\/"|href="\/api\/download"/.test(read(p))]),
  ['the download page button goes through /api/download', () => /<a class="btn dl-btn" id="downloadLink" href="\/api\/download">Download for Mac<\/a>/.test(download)],
  ['the download page has no password field and no call to download-auth', () => !/type="password"|download-auth/.test(download)],
  ['the download page states the limits: Apple silicon, beta, free, closed source', () => /Apple silicon/.test(download) && /beta/i.test(download) && /free/i.test(download) && /closed source, all rights reserved/.test(download)],
  ['the download page says it is signed and notarized, with no Gatekeeper steps', () => /signed and notarized/.test(download) && !/right-click|Privacy &amp; Security|Gatekeeper/i.test(download)],
  ['the download page drops "shared with you privately" and "don\'t pass on"', () => !/shared with you privately|pass on the app/i.test(download)],
  ['the new-build box sends the email, Apple silicon, no name, tagged download-page', () => /email: email/.test(boxBody) && /computer: 'mac-apple-silicon'/.test(boxBody) && /'download-page'/.test(boxBody) && !/\bname\s*:/.test(boxBody)],
  ['the new-build box is optional: its input is not required, and the button is a plain link', () => {
    const input = download.match(/<input type="email" id="email"[^>]*>/);
    return input && !/required/.test(input[0]) && !/addEventListener\('click'[\s\S]*downloadLink/.test(download);
  }],
  ['the download page says how clicks are counted and still promises no analytics or cookies', () => /counts clicks: a date and the version, nothing about you/.test(download) && /No analytics, no cookies/.test(download)],
  ['the sign-up page keeps its form and the computer it requires', () => { const s = read('workspace/signup/index.html'); return /id="signupForm"/.test(s) && /Please choose a computer\./.test(s) && /Get an email when there's a new build/.test(s); }],
  ['/api/download-auth is gone', () => !existsSync(join(root, 'api/download-auth.js'))],
  ['/workspace/beta-download still redirects to the download page', () => { const v = JSON.parse(read('vercel.json')); return v.redirects.some((r) => r.source === '/workspace/beta-download' && r.destination === '/workspace/download'); }],
  ...PAGES.map((p) => [`${p} has no stale access, invite or password wording`, () => !STALE.test(read(p))]),
  ['the try page\'s sign-up words have no invite or waiting', () => !STALE.test(read('workspace/try/button.js').match(/const WORDS = \{[\s\S]*?\n\};/)[0])],
  ['the demo\'s sample page links to the download, not an invite', () => /\[Download Workspace\]\(https:\/\/www\.brianhirsh\.com\/workspace\/download\/\)/.test(read('workspace/try/files.js')) && !/Get invited/.test(read('workspace/try/files.js'))],
  ['the confirmation email has no stale wording', () => ['subject', 'html', 'text'].every((k) => !STALE.test(confirmation[k]) && !/\binvite/i.test(confirmation[k]))],
  ['the link-preview cards have no stale wording', () => !STALE.test(read('tools/make-og.mjs').match(/export const CARDS = \[[\s\S]*?\];/)[0])],
];

let failed = 0;
for (const [name, ok] of cases) {
  let pass = false;
  try { pass = !!ok(); } catch (err) { console.log('  threw:', err.message); }
  if (!pass) failed++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}`);
}
console.log(`\n${cases.length - failed} pass, ${failed} fail`);
process.exit(failed ? 1 : 0);
