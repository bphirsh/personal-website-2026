#!/usr/bin/env node
/**
 * download-count — print how many times the Workspace download button was pressed, from production.
 *
 *   node tools/download-count.mjs [url]
 *
 * Reads https://www.brianhirsh.com/api/download-count (or the url given, e.g. a preview deploy's) and prints the total, then by day and by version. The endpoint is private (9 Nov 2026): this sends the key from the Mac's Keychain (service brianhirsh-download-count, the same value as DOWNLOAD_COUNT_KEY in Vercel) and never prints it. It counts clicks on the button, not finished downloads or installs.
 */

import { execFileSync } from 'node:child_process';

const url = process.argv[2] || 'https://www.brianhirsh.com/api/download-count';

let key = '';
try { key = execFileSync('security', ['find-generic-password', '-s', 'brianhirsh-download-count', '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch {}
if (!key) {
  console.error('No key in the Keychain (service brianhirsh-download-count). See the comment at the top of api/download-count.js.');
  process.exit(1);
}

const res = await fetch(url, { headers: { accept: 'application/json', 'x-count-key': key } });
const body = await res.json().catch(() => null);
if (!res.ok || !body) {
  console.error(`${url} answered ${res.status}${body && body.error ? `: ${body.error}` : ''}${res.status === 404 ? ' (the key in the Keychain and DOWNLOAD_COUNT_KEY in Vercel differ, or the variable is not set)' : ''}`);
  process.exit(1);
}
if (!body.counting) {
  console.log('Not counting: no Blob store is connected in Vercel, so no clicks are recorded.');
  process.exit(0);
}

console.log(`Download button clicks (not installs): ${body.total}\n`);
const days = Object.entries(body.byDay || {});
if (days.length) {
  console.log('By day (UTC):');
  for (const [d, n] of days) console.log(`  ${d}  ${String(n).padStart(5)}`);
  console.log('');
}
const versions = Object.entries(body.byVersion || {});
if (versions.length) {
  console.log('By version:');
  for (const [v, n] of versions) console.log(`  ${v.padEnd(10)} ${String(n).padStart(5)}`);
}
