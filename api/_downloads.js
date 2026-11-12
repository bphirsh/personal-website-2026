/**
 * The public download and its click count (rows "Make the download public across the site" and "Count how often the build is downloaded", 9 Nov 2026).
 *
 * latestBuild reads the release feed, https://releases.brianhirsh.com/latest-mac.yml (the file the app's own updater reads), and returns the .dmg it names, so the download never goes stale when a new version ships. The answer is kept in this instance's memory for a minute; when the feed can't be read in a few seconds, the last answer is used, or else FALLBACK, so a download never fails for it.
 *
 * recordClick stores one click as one tiny object in Vercel Blob: `downloads/<date>/<version>-<random>.txt`, body "1". Nothing else is stored: no IP, no user agent, no cookie, no referrer, nothing about the person. One object per click, with a random part in its name, means two clicks at once never overwrite each other (no read-modify-write). countClicks lists those objects and adds them up by day and by version. With no Blob store connected (BLOB_STORE_ID with the project's OIDC token, or BLOB_READ_WRITE_TOKEN), nothing is counted and nothing fails.
 *
 * Vercel Blob is called over its REST API with plain fetch, not the @vercel/blob package: a package would need a package.json, which the site deliberately doesn't have (api/README.md). The calls are the ones @vercel/blob 2.8.2 makes (read from its published source on 9 Nov 2026): PUT https://vercel.com/api/blob/?pathname=<p> with the headers below to store, and GET https://vercel.com/api/blob?prefix=<p>&limit=1000&cursor=<c> to list ({ blobs: [{ pathname }], cursor, hasMore }). The store id is the fourth "_"-separated part of the token (vercel_blob_rw_<storeId>_<secret>).
 *
 * Files starting with "_" in api/ are not deployed as endpoints.
 */

const crypto = require('crypto');

const RELEASES = 'https://releases.brianhirsh.com/';
const FEED = RELEASES + 'latest-mac.yml';

/** Used when the feed can't be read and nothing was read before: the signed, notarized build current on 9 Nov 2026. */
const FALLBACK = { version: '1.1.3', url: RELEASES + 'Workspace-1.1.3-arm64.dmg', size: 161433811, fallback: true };

/** In milliseconds. An object, so tools/check-download.mjs can shorten them. */
const TIMEOUTS = { feed: 2500, count: 1500, list: 8000, feedCacheMs: 60 * 1000 };

const BLOB_API_VERSION = '13';
const PREFIX = 'downloads/';
const DMG_RE = /^[A-Za-z0-9._+-]+\.dmg$/;
const VERSION_RE = /^[0-9A-Za-z.+-]{1,40}$/;
const RECORD_RE = /^downloads\/(\d{4}-\d{2}-\d{2})\/([0-9A-Za-z.+-]{1,40})-[0-9a-f]{12}\.txt$/;

let cached = null; // { build, at }

/** For the check: forget what this instance remembers. */
function reset() { cached = null; }

/** fetch, given up after `ms`. */
async function fetchWithin(ms, url, init = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); } finally { clearTimeout(timer); }
}

/**
 * The .dmg in latest-mac.yml as { version, url, size }, or null when it names none. The feed is electron-builder's: a `version:` line and a `files:` list of `- url:` entries, each followed by its `size:`. Only a bare file name is accepted, always served from the releases host, so the redirect can't be pointed anywhere else.
 */
function parseFeed(text) {
  const s = String(text || '');
  const v = s.match(/^version:\s*['"]?([^'"\s]+)['"]?\s*$/m);
  const version = v && VERSION_RE.test(v[1]) ? v[1] : null;
  const lines = s.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*-\s*url:\s*['"]?([^'"\s]+)['"]?\s*$/);
    if (!m || !DMG_RE.test(m[1])) continue;
    let size = null;
    for (let j = i + 1; j < lines.length && !/^\s*-\s/.test(lines[j]) && /^\s/.test(lines[j]); j++) {
      const z = lines[j].match(/^\s*size:\s*(\d+)\s*$/);
      if (z) size = Number(z[1]);
    }
    return { version, url: RELEASES + m[1], size };
  }
  return null;
}

/** The current build: from memory when read in the last minute, else from the feed, else the last one read, else FALLBACK. Never throws. */
async function latestBuild() {
  if (cached && Date.now() - cached.at < TIMEOUTS.feedCacheMs) return cached.build;
  try {
    const res = await fetchWithin(TIMEOUTS.feed, FEED, { cache: 'no-store' });
    if (!res.ok) throw new Error(`feed answered ${res.status}`);
    const build = parseFeed(await res.text());
    if (!build) throw new Error('feed names no .dmg');
    // No version line: take it from the file name (Workspace-1.1.3-arm64.dmg).
    if (!build.version) { const n = build.url.match(/-(\d+\.\d+[0-9A-Za-z.+]*)-/); build.version = n ? n[1] : 'unknown'; }
    cached = { build, at: Date.now() };
    return build;
  } catch (err) {
    console.error('download: the release feed could not be read;', cached ? 'using the last one read' : 'using the fallback', String(err && err.message || err).slice(0, 200));
    return cached ? cached.build : FALLBACK;
  }
}

/**
 * The Blob store's credentials, or null when counting is off. Two ways, as @vercel/blob 2.8.2 resolves them: a store connected since Vercel's OIDC change gives BLOB_STORE_ID, and the function signs in with the project's OIDC token (the x-vercel-oidc-token request header, or VERCEL_OIDC_TOKEN); an older store gives BLOB_READ_WRITE_TOKEN, which carries its own store id. OIDC is tried first, as the package does.
 */
function blobAuth(req) {
  const storeId = (process.env.BLOB_STORE_ID || '').trim().replace(/^store_/, '');
  const h = req && req.headers ? req.headers['x-vercel-oidc-token'] : undefined;
  const oidc = String((Array.isArray(h) ? h[0] : h) || process.env.VERCEL_OIDC_TOKEN || '').trim();
  if (storeId && oidc) return { token: oidc, storeId, kind: 'oidc' };
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;
  return { token, storeId: token.split('_')[3] || '', kind: 'readWrite' };
}

function blobHeaders(auth) {
  return { authorization: `Bearer ${auth.token}`, 'x-api-version': BLOB_API_VERSION, 'x-vercel-blob-store-id': auth.storeId };
}

const blobApi = () => process.env.VERCEL_BLOB_API_URL || 'https://vercel.com/api/blob';

/** Today in UTC, as 2026-11-09. */
const today = () => new Date().toISOString().slice(0, 10);

/** The one object a click stores: its name holds the date, the version and a random part; its body is "1". */
function recordPath(version, date = today()) {
  const v = VERSION_RE.test(String(version)) ? String(version) : 'unknown';
  return `${PREFIX}${date}/${v}-${crypto.randomBytes(6).toString('hex')}.txt`;
}

/**
 * Store one click. Resolves to { ok, detail }, never throws, and gives up after TIMEOUTS.count so the redirect is never held up for long. With no token it does nothing and says so once per instance.
 */
let saidOff = false;
async function recordClick(version, req) {
  const auth = blobAuth(req);
  if (!auth) {
    if (!saidOff) { console.log('download: no Blob store is connected (BLOB_STORE_ID with OIDC, or BLOB_READ_WRITE_TOKEN), so clicks are not counted'); saidOff = true; }
    return { ok: false, detail: 'counting is off' };
  }
  const pathname = recordPath(version);
  // The access the store was made with: a store is public or private, and a PUT naming the other is refused. BLOB_ACCESS says which; unset, public is tried first and private once if refused. The object's name and body say nothing about anyone either way.
  const first = process.env.BLOB_ACCESS === 'private' ? 'private' : 'public';
  const put = (access) => fetchWithin(TIMEOUTS.count, `${blobApi()}/?${new URLSearchParams({ pathname })}`, {
    method: 'PUT',
    headers: { ...blobHeaders(auth), 'x-vercel-blob-access': access, 'x-content-type': 'text/plain', 'x-add-random-suffix': '0' },
    body: '1',
  });
  try {
    let res = await put(first);
    if (!res.ok && res.status === 400 && !process.env.BLOB_ACCESS) {
      const why = await res.text().catch(() => '');
      if (/access/i.test(why)) res = await put(first === 'public' ? 'private' : 'public');
      else res = new Response(why, { status: 400 });
    }
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 200);
      console.error('download: the click was not counted', res.status, detail);
      return { ok: false, detail: `${res.status}` };
    }
    return { ok: true, detail: pathname };
  } catch (err) {
    console.error('download: the click was not counted', String(err && err.message || err).slice(0, 200));
    return { ok: false, detail: 'threw' };
  }
}

/**
 * Every stored click, added up: { total, byDay: { date: n }, byVersion: { version: n }, counting }. Throws when Blob can't be listed, so the endpoint can say so rather than report a false zero.
 */
async function countClicks(req) {
  const auth = blobAuth(req);
  if (!auth) return { total: 0, byDay: {}, byVersion: {}, clicks: [], counting: false };
  const byDay = {};
  const byVersion = {};
  const clicks = [];
  let total = 0;
  let cursor;
  for (let page = 0; page < 200; page++) {
    const params = new URLSearchParams({ prefix: PREFIX, limit: '1000' });
    if (cursor) params.set('cursor', cursor);
    const res = await fetchWithin(TIMEOUTS.list, `${blobApi()}?${params}`, { method: 'GET', headers: blobHeaders(auth) });
    if (!res.ok) throw new Error(`Blob list answered ${res.status}`);
    const body = await res.json();
    for (const b of body.blobs || []) {
      const m = RECORD_RE.exec(b.pathname || '');
      if (!m) continue;
      total++;
      byDay[m[1]] = (byDay[m[1]] || 0) + 1;
      byVersion[m[2]] = (byVersion[m[2]] || 0) + 1;
      // The moment Blob stored it, so a reader can count days in its own time zone (the day in the path is UTC).
      clicks.push({ at: b.uploadedAt || null, version: m[2] });
    }
    if (!body.hasMore || !body.cursor) break;
    cursor = body.cursor;
  }
  const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
  clicks.sort((a, b) => String(a.at) < String(b.at) ? -1 : 1);
  return { total, byDay: sorted(byDay), byVersion: sorted(byVersion), clicks, counting: true };
}

module.exports = { latestBuild, parseFeed, recordClick, recordPath, countClicks, reset, TIMEOUTS, FALLBACK, FEED, RECORD_RE };
