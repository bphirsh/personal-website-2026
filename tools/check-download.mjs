#!/usr/bin/env node
/**
 * check-download — run /api/download and /api/download-count locally with the release feed and Vercel Blob stubbed out, so nothing is fetched, stored or counted anywhere.
 *
 *   node tools/check-download.mjs
 *
 * It loads api/download.js and api/download-count.js as Vercel would, replaces global fetch with a recorder that plays the feed (releases.brianhirsh.com/latest-mac.yml) and Blob's REST API (vercel.com/api/blob) as each case says, and calls the handlers with made-up requests: with and without BLOB_READ_WRITE_TOKEN, with the feed down, slow or wrong, and with Blob refusing or hanging. Each case says PASS or FAIL; exit 1 on any FAIL. What it cannot see: Vercel's own request handling, the real feed, and the real Blob store, which only a preview or production deploy shows.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const downloads = require('../api/_downloads.js');
const download = require('../api/download.js');
const downloadCount = require('../api/download-count.js');

// Short, so a hanging stub costs a fraction of a second rather than seconds.
Object.assign(downloads.TIMEOUTS, { feed: 150, count: 150, list: 300 });

const TOKEN = 'vercel_blob_rw_storeABC123_notarealsecret';
const FEED_TEXT = `version: 1.2.0
files:
  - url: Workspace-1.2.0-arm64-mac.zip
    sha512: abc
    size: 159819290
  - url: Workspace-1.2.0-arm64.dmg
    sha512: def
    size: 162000000
path: Workspace-1.2.0-arm64-mac.zip
sha512: abc
releaseDate: '2026-11-20T16:17:49.179Z'
`;

// What each case's network does. `feed` and `put` and `list` are 'ok', 'fail', 'hang', or for the feed a text to serve.
let net = {};
let calls = [];
let stored = []; // pathnames Blob was asked to store, as a store would keep them
const hang = (signal) => new Promise((_, reject) => signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
const reply = (status, body) => ({ ok: status < 300, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)), json: async () => body });

globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url);
  const c = { url: String(url), method: init.method || 'GET', headers: init.headers || {}, body: init.body };
  calls.push(c);
  if (u.host === 'releases.brianhirsh.com') {
    if (net.feed === 'hang') return hang(init.signal);
    if (net.feed === 'fail') return reply(503, 'down');
    if (net.feed === 'throw') throw new Error('getaddrinfo ENOTFOUND');
    return reply(200, typeof net.feed === 'string' ? net.feed : FEED_TEXT);
  }
  if (u.host === 'vercel.com' && u.pathname.startsWith('/api/blob')) {
    if (c.method === 'PUT') {
      if (net.put === 'hang') return hang(init.signal);
      if (net.put === 'fail') return reply(403, { error: { code: 'forbidden' } });
      stored.push(u.searchParams.get('pathname'));
      return reply(200, { url: 'https://storeabc123.public.blob.vercel-storage.com/' + u.searchParams.get('pathname'), pathname: u.searchParams.get('pathname') });
    }
    if (net.list === 'fail') return reply(500, 'nope');
    if (net.list === 'hang') return hang(init.signal);
    // Two to a page, so paging is exercised.
    const all = stored.filter((p) => p.startsWith(u.searchParams.get('prefix') || ''));
    const start = Number(u.searchParams.get('cursor') || 0);
    const page = all.slice(start, start + 2);
    const more = start + 2 < all.length;
    return reply(200, { blobs: page.map((pathname) => ({ pathname, url: 'https://x/' + pathname, size: 1 })), hasMore: more, ...(more ? { cursor: String(start + 2) } : {}) });
  }
  throw new Error('unexpected fetch ' + url);
};

function makeRes() {
  const r = { statusCode: 0, headers: {}, body: undefined, ended: false };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.status = (s) => { r.statusCode = s; return r; };
  r.json = (j) => { r.body = j; r.ended = true; return r; };
  r.end = () => { r.ended = true; return r; };
  return r;
}

async function run(handler, req) {
  const res = makeRes();
  const t = Date.now();
  await handler({ query: {}, headers: {}, ...req }, res);
  res.ms = Date.now() - t;
  return res;
}

const puts = () => calls.filter((c) => c.method === 'PUT');
const feedCalls = () => calls.filter((c) => c.url.includes('releases.brianhirsh.com'));
const noCookie = (r) => !('set-cookie' in r.headers);

const cases = [
  // The redirect.
  ['a GET redirects 302 to the .dmg the feed names, on the releases host', {}, () => run(download, { method: 'GET' }),
    (r) => r.statusCode === 302 && r.headers.location === 'https://releases.brianhirsh.com/Workspace-1.2.0-arm64.dmg' && r.ended],
  ['the redirect is never cached, so every click reaches the function', {}, () => run(download, { method: 'GET' }), (r) => r.headers['cache-control'] === 'no-store'],
  ['no cookie is set on the redirect', {}, () => run(download, { method: 'GET' }), noCookie],
  ['the feed is read once a minute, not per click', {}, async () => { await run(download, { method: 'GET' }); return run(download, { method: 'GET' }); }, () => feedCalls().length === 1],
  ['the feed down: redirect to the fallback 1.1.3 dmg', { feed: 'fail' }, () => run(download, { method: 'GET' }),
    (r) => r.statusCode === 302 && r.headers.location === 'https://releases.brianhirsh.com/Workspace-1.1.3-arm64.dmg'],
  ['the feed unreachable: the fallback', { feed: 'throw' }, () => run(download, { method: 'GET' }), (r) => r.statusCode === 302 && r.headers.location.endsWith('Workspace-1.1.3-arm64.dmg')],
  ['the feed hanging: gives up and redirects to the fallback quickly', { feed: 'hang' }, () => run(download, { method: 'GET' }),
    (r) => r.statusCode === 302 && r.headers.location.endsWith('Workspace-1.1.3-arm64.dmg') && r.ms < 1000],
  ['a feed naming no .dmg: the fallback', { feed: 'version: 9.9.9\nfiles:\n  - url: Workspace-9.9.9-arm64-mac.zip\n    size: 1\n' }, () => run(download, { method: 'GET' }),
    (r) => r.headers.location.endsWith('Workspace-1.1.3-arm64.dmg')],
  ['a feed pointing at another host is not followed: the fallback', { feed: 'version: 6.6.6\nfiles:\n  - url: https://evil.example/x.dmg\n    size: 1\n' }, () => run(download, { method: 'GET' }),
    (r) => r.headers.location.startsWith('https://releases.brianhirsh.com/') && r.headers.location.endsWith('Workspace-1.1.3-arm64.dmg')],
  ['once read, a later feed failure keeps the last good build', {}, async () => {
    await run(download, { method: 'GET' });
    downloads.TIMEOUTS.feedCacheMs = 0; net.feed = 'fail';
    try { return await run(download, { method: 'GET' }); } finally { downloads.TIMEOUTS.feedCacheMs = 60000; }
  }, (r) => r.headers.location.endsWith('Workspace-1.2.0-arm64.dmg')],
  ['a POST is refused', {}, () => run(download, { method: 'POST' }), (r) => r.statusCode === 405 && puts().length === 0],
  ['?info=1 answers the version, size and url, and counts nothing', { token: true }, () => run(download, { method: 'GET', query: { info: '1' } }),
    (r) => r.statusCode === 200 && r.body.version === '1.2.0' && r.body.size === 162000000 && r.body.url.endsWith('Workspace-1.2.0-arm64.dmg') && puts().length === 0],

  // Counting, with a token.
  ['with a token: one GET stores exactly one click', { token: true }, () => run(download, { method: 'GET' }), (r) => r.statusCode === 302 && puts().length === 1 && stored.length === 1],
  ['the stored click is downloads/<today>/<version>-<random>.txt with body "1", nothing else', { token: true }, () => run(download, { method: 'GET' }), () => {
    const p = stored[0];
    const today = new Date().toISOString().slice(0, 10);
    const put = puts()[0];
    return downloads.RECORD_RE.test(p) && p.startsWith(`downloads/${today}/1.2.0-`) && put.body === '1';
  }],
  ['the PUT is the @vercel/blob 2.8.2 call: /api/blob/?pathname=, bearer token, store id, api version, access', { token: true }, () => run(download, { method: 'GET' }), () => {
    const c = puts()[0];
    return c.url.startsWith('https://vercel.com/api/blob/?pathname=downloads%2F') && c.headers.authorization === `Bearer ${TOKEN}`
      && c.headers['x-vercel-blob-store-id'] === 'storeABC123' && c.headers['x-api-version'] === '13' && c.headers['x-vercel-blob-access'] === 'public' && c.headers['x-add-random-suffix'] === '0';
  }],
  ['the request\'s IP, user agent and cookies never reach the store', { token: true },
    () => run(download, { method: 'GET', headers: { 'x-forwarded-for': '203.0.113.9', 'user-agent': 'SecretBrowser/1.0', cookie: 'a=b', referer: 'https://ref.example/' } }),
    () => !JSON.stringify(calls).match(/203\.0\.113\.9|SecretBrowser|a=b|ref\.example/)],
  ['two clicks are two different objects (no overwrite)', { token: true }, async () => { await run(download, { method: 'GET' }); return run(download, { method: 'GET' }); }, () => stored.length === 2 && stored[0] !== stored[1]],
  ['a HEAD redirects but counts nothing', { token: true }, () => run(download, { method: 'HEAD' }), (r) => r.statusCode === 302 && puts().length === 0],
  ['Blob refusing: still redirects', { token: true, put: 'fail' }, () => run(download, { method: 'GET' }), (r) => r.statusCode === 302 && r.headers.location.endsWith('Workspace-1.2.0-arm64.dmg')],
  ['Blob hanging: still redirects, within the short wait', { token: true, put: 'hang' }, () => run(download, { method: 'GET' }), (r) => r.statusCode === 302 && r.ms < 1000],
  ['a bad token (Blob says 403): still redirects', { token: 'vercel_blob_rw_wrong_wrong', put: 'fail' }, () => run(download, { method: 'GET' }), (r) => r.statusCode === 302],

  // Without a token.
  ['no token: redirects, and Blob is never called', {}, () => run(download, { method: 'GET' }), (r) => r.statusCode === 302 && calls.every((c) => !c.url.includes('vercel.com'))],

  // The count.
  ['the count with no token: counting false, zeros, Blob never called', {}, () => run(downloadCount, { method: 'GET' }),
    (r) => r.statusCode === 200 && r.body.counting === false && r.body.total === 0 && JSON.stringify(r.body.byDay) === '{}' && calls.length === 0],
  ['the count with a token: totals by day and by version, across pages', { token: true, seed: true }, () => run(downloadCount, { method: 'GET' }),
    (r) => r.statusCode === 200 && r.body.counting === true && r.body.total === 5
      && r.body.byDay['2026-11-09'] === 3 && r.body.byDay['2026-11-10'] === 2 && r.body.byVersion['1.1.3'] === 4 && r.body.byVersion['1.2.0'] === 1
      && calls.filter((c) => c.method === 'GET').length === 3],
  ['the count skips anything in the store that is not a click record', { token: true, seed: true, extra: ['downloads/notes.txt', 'Workspace-1.1.3-arm64.dmg'] }, () => run(downloadCount, { method: 'GET' }), (r) => r.body.total === 5],
  ['the count holds no identities: only total, byDay, byVersion, counting', { token: true, seed: true }, () => run(downloadCount, { method: 'GET' }),
    (r) => Object.keys(r.body).sort().join() === 'byDay,byVersion,counting,total'],
  ['the count is cached at the edge for a minute', { token: true, seed: true }, () => run(downloadCount, { method: 'GET' }), (r) => /s-maxage=60/.test(r.headers['cache-control'])],
  ['Blob failing to list: 502, not a false zero', { token: true, list: 'fail' }, () => run(downloadCount, { method: 'GET' }), (r) => r.statusCode === 502 && r.body.total === undefined],
  ['a click then the count: the count is one', { token: true }, async () => { await run(download, { method: 'GET' }); return run(downloadCount, { method: 'GET' }); }, (r) => r.body.total === 1 && r.body.byVersion['1.2.0'] === 1],
];

let failed = 0;
for (const [name, setup, act, ok] of cases) {
  net = { feed: setup.feed, put: setup.put, list: setup.list };
  calls = [];
  stored = [];
  downloads.reset();
  if (setup.token) process.env.BLOB_READ_WRITE_TOKEN = setup.token === true ? TOKEN : setup.token;
  else delete process.env.BLOB_READ_WRITE_TOKEN;
  if (setup.seed) {
    stored.push('downloads/2026-11-09/1.1.3-0123456789ab.txt', 'downloads/2026-11-09/1.1.3-0123456789ac.txt', 'downloads/2026-11-09/1.2.0-0123456789ad.txt',
      'downloads/2026-11-10/1.1.3-0123456789ae.txt', 'downloads/2026-11-10/1.1.3-0123456789af.txt', ...(setup.extra || []));
  }
  let r;
  let pass = false;
  try { r = await act(); pass = !!ok(r); } catch (err) { console.log('  threw:', err.message); }
  if (!pass) failed++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${r ? `  → ${r.statusCode}` : ''}`);
}

console.log('\nWhat one stored click looks like:');
net = {}; calls = []; stored = []; downloads.reset(); process.env.BLOB_READ_WRITE_TOKEN = TOKEN;
await run(download, { method: 'GET' });
console.log(`  pathname: ${stored[0]}\n  body:     ${JSON.stringify(puts()[0].body)}`);

console.log(`\n${cases.length - failed} pass, ${failed} fail`);
process.exit(failed ? 1 : 0);
