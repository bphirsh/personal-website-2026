/**
 * GET /api/download — the download button on every Workspace page (9 Nov 2026).
 *
 * Reads the current .dmg from the release feed (api/_downloads.js) and 302-redirects to it on releases.brianhirsh.com, so the button always gives the newest signed build and the page never goes stale. The file is never streamed through this function.
 *
 * Each GET counts one click (date and version only, nothing about the person) when a Blob store is connected. The count is awaited for at most a second and a half, and a counting failure never stops the redirect. A HEAD, as link previews and prefetchers send, is redirected without counting.
 *
 * GET /api/download?info=1 answers { version, size, url } instead, without counting: the download page shows the version and size from it, since the feed's host doesn't allow the browser to read it directly.
 *
 * It sets no cookie and reads nothing from the request but its method, its query and the x-vercel-oidc-token header Vercel adds, which signs in to the Blob store.
 */

const { latestBuild, recordClick, TIMEOUTS } = require('./_downloads.js');

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const build = await latestBuild();
  const info = req.query ? req.query.info : new URL(req.url || '/', 'https://x').searchParams.get('info');

  if (info) {
    // Cached at the edge for a minute: this is the same for everyone and counts nothing.
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
    res.status(200).json({ version: build.version, size: build.size, url: build.url });
    return;
  }

  if (req.method === 'GET') {
    // Wait a little for the count, never long: the redirect goes either way.
    await Promise.race([recordClick(build.version, req), new Promise((r) => setTimeout(r, TIMEOUTS.count))]);
  }

  // Never cached, by Vercel, Cloudflare or the browser, so every click reaches this function and is counted.
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Location', build.url);
  res.status(302);
  res.end();
};
