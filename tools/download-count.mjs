#!/usr/bin/env node
/**
 * download-count — print how many times the Workspace download button was pressed, from production.
 *
 *   node tools/download-count.mjs [url]
 *
 * Reads https://www.brianhirsh.com/api/download-count (or the url given, e.g. a preview deploy's) and prints the total, then by day and by version. No key is needed and none is printed: the endpoint holds no identities, only dates and versions. It counts clicks on the button, not finished downloads or installs. The endpoint is cached for a minute, so a click shows up within about a minute.
 */

const url = process.argv[2] || 'https://www.brianhirsh.com/api/download-count';

const res = await fetch(url, { headers: { accept: 'application/json' } });
const body = await res.json().catch(() => null);
if (!res.ok || !body) {
  console.error(`${url} answered ${res.status}${body && body.error ? `: ${body.error}` : ''}`);
  process.exit(1);
}
if (!body.counting) {
  console.log('Not counting: BLOB_READ_WRITE_TOKEN is not set in Vercel, so no clicks are recorded.');
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
