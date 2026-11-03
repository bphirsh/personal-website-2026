/**
 * Two landing headlines, counted by sign-ups (row "Two try-page headlines, counted by sign-ups", 3 Nov 2026).
 *
 * Each visit is shown one of two headlines from Marketing/Growth/Story.md, chosen at random when the page loads and kept only in this page's memory: no cookie, no storage, no request. The try page's sign-up sends which one it was (`headline: "a"` or `"b"`) with the rest, and /api/invite-reply saves it on the Resend contact, so the split is read from sign-ups alone. Nothing else is measured.
 *
 *   a: Story.md's Pass 3 hook (its 915 is the queue's count on 3 Nov 2026; recount before changing it).
 *   b: hook 26, a "keep": the try page's own moment.
 *
 * The page's own "Get your own Workspace" stays in the HTML for a visit without scripts.
 */

export const HEADLINES = {
  a: 'My AI agents have finished 915 tasks while I watched them happen in a database.',
  b: 'I asked Claude for a letter about working with me, and it made me a whole workspace.',
};

/** "a" or "b", even odds; `random` replaces Math.random for tests. */
export function pickHeadline(random = Math.random) {
  return random() < 0.5 ? 'a' : 'b';
}

/** Put the variant's headline in `title`, marked with the variant for the CSS. */
export function showHeadline(title, variant) {
  title.textContent = HEADLINES[variant];
  title.dataset.headline = variant;
}
