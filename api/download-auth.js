/**
 * POST /api/download-auth — the password gate for the dev build.
 *
 * The BETA_PASSWORD variable keeps its original name on purpose: renaming it
 * would break a variable already configured in Vercel, for no user-visible
 * gain. The file and route were renamed because they are reachable URLs.
 *
 * On a correct password this returns the Blob URL of the .dmg. The build is
 * NOT streamed through this function: at ~119MB that risks the function
 * timeout on a slow connection and bills the bandwidth twice (Blob → function
 * → browser). Handing back the CDN URL keeps the download fast and direct.
 *
 * The trade, stated plainly: a Blob URL is unguessable but does not expire, so
 * a tester who gets it can forward it. That is acceptable for a short
 * short private dev build and would not be acceptable at launch.
 *
 * There is no per-IP rate limiting here because serverless instances share no
 * memory, so any in-process counter is trivially bypassed by hitting a
 * different instance. The defence is password entropy instead: use a long
 * random passphrase and online guessing is hopeless.
 *
 * Environment variables (Vercel → Settings → Environment Variables):
 *   BETA_PASSWORD   the shared dev build password
 *   DMG_URL         public Blob URL of the .dmg
 *   DMG_VERSION     optional, e.g. "0.0.1"
 *   DMG_ARCH        optional, e.g. "Apple Silicon (arm64)"
 */

const crypto = require('crypto');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Formatted by hand rather than with toLocaleDateString, which under en-GB
 * renders September as "Sept" — four letters where every other month gets
 * three — and whose output varies with the runtime's ICU data. This is stable
 * everywhere and always the same width.
 */
function formatDate(d) {
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${day} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Compare without leaking the answer through response timing. */
function timingSafeEqual(a, b) {
  const ab = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  // timingSafeEqual throws on length mismatch, so hash both to a fixed width
  // first. That keeps the comparison constant-time regardless of length.
  const ah = crypto.createHash('sha256').update(ab).digest();
  const bh = crypto.createHash('sha256').update(bb).digest();
  return crypto.timingSafeEqual(ah, bh);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  let data = req.body;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch { data = null; }
  }
  if (!data || typeof data !== 'object') {
    res.status(400).json({ error: 'Malformed request.' });
    return;
  }

  const expected = process.env.BETA_PASSWORD;
  if (!expected) {
    console.error('download-auth: BETA_PASSWORD is not set');
    res.status(500).json({ error: 'The download service is misconfigured.' });
    return;
  }

  if (!timingSafeEqual(String(data.password || ''), expected)) {
    res.status(401).json({ error: 'Incorrect password.' });
    return;
  }

  // Checked only after the password, so a wrong guess cannot be used to probe
  // whether a build exists yet.
  const url = process.env.DMG_URL;
  if (!url) {
    res.status(503).json({ error: "The build isn't uploaded yet — check back shortly." });
    return;
  }

  // Size and build date come from Blob rather than being hand-maintained in an
  // env var that would quietly go stale on the next upload. A failure here is
  // not worth failing the download over, so the metadata is simply omitted.
  let size = null;
  let built = null;
  try {
    const head = await fetch(url, { method: 'HEAD' });
    if (head.ok) {
      const len = head.headers.get('content-length');
      if (len) size = parseInt(len, 10);
      const mod = head.headers.get('last-modified');
      if (mod) {
        const d = new Date(mod);
        if (!Number.isNaN(d.getTime())) built = formatDate(d);
      }
    }
  } catch (err) {
    console.error('download-auth: HEAD on the build failed', err);
  }

  res.status(200).json({
    url,
    version: process.env.DMG_VERSION || null,
    arch: process.env.DMG_ARCH || 'Apple Silicon (arm64)',
    size,
    built,
  });
};
