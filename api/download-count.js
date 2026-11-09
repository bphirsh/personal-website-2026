/**
 * GET /api/download-count — how many times the download button was pressed (9 Nov 2026).
 *
 * Answers { total, byDay: { "2026-11-09": n }, byVersion: { "1.1.3": n }, counting } from the clicks /api/download stored in Vercel Blob (api/_downloads.js). It counts presses of the button, not finished downloads or installs. There is nothing about anyone to show: each click is stored as a date and a version only. `counting: false` means no Blob store is connected, so nothing is being counted.
 *
 * Read it with `node tools/download-count.mjs`. The answer is cached at the edge for a minute, so reading it often can't run up Blob's list operations.
 */

const { countClicks } = require('./_downloads.js');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }
  try {
    const counts = await countClicks(req);
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
    res.status(200).json(counts);
  } catch (err) {
    console.error('download-count: Blob could not be listed', String(err && err.message || err).slice(0, 200));
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: "The count couldn't be read just now.", counting: true });
  }
};
