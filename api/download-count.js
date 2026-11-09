/**
 * GET /api/download-count — how many times the download button was pressed (9 Nov 2026).
 *
 * Answers { total, byDay: { "2026-11-09": n }, byVersion: { "1.1.3": n }, counting } from the clicks /api/download stored in Vercel Blob (api/_downloads.js). It counts presses of the button, not finished downloads or installs. There is nothing about anyone to show: each click is stored as a date and a version only. `counting: false` means no Blob store is connected, so nothing is being counted.
 *
 * Private (Brian, 9 Nov 2026): it answers only a request carrying the key in DOWNLOAD_COUNT_KEY (set in Vercel) as the x-count-key header. Without that variable, or without the right key, it answers 404 as if it weren't there. The answer is never cached at the edge, since the edge cache doesn't know about the header. Read it with `node tools/download-count.mjs`, which takes the key from the Mac's Keychain.
 */

const crypto = require('crypto');
const { countClicks } = require('./_downloads.js');

function keyOk(req) {
  const want = process.env.DOWNLOAD_COUNT_KEY || '';
  const h = req && req.headers ? req.headers['x-count-key'] : '';
  const got = String((Array.isArray(h) ? h[0] : h) || '');
  if (want.length < 16 || !got) return false;
  const a = crypto.createHash('sha256').update(want).digest();
  const b = crypto.createHash('sha256').update(got).digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }
  res.setHeader('Cache-Control', 'private, no-store');
  if (!keyOk(req)) {
    res.status(404).json({ error: 'Not found.' });
    return;
  }
  try {
    const counts = await countClicks(req);
    res.status(200).json(counts);
  } catch (err) {
    console.error('download-count: Blob could not be listed', String(err && err.message || err).slice(0, 200));
    res.status(502).json({ error: "The count couldn't be read just now.", counting: true });
  }
};
