/**
 * What runs on /workspace/try. On a touch-only device (a phone or an iPad), the page is not for it (Brian, 27 Oct 2026): the two covers show and nothing of the page loads, so no drop zone or demo runs. On anything else the page's scripts load as before.
 *
 * Touch-only means no hover and a coarse pointer, with no fine pointer anywhere: an iPad with a trackpad, or a touch laptop, has a fine pointer and gets the page. try.css shows the covers by the same rule, so they show before this runs.
 */

import { playBeat } from './cover-beat.js';

export const TOUCH_ONLY = '(hover: none) and (pointer: coarse)';
export const ANY_FINE = '(any-pointer: fine)';

export function isTouchOnly(match = (q) => matchMedia(q).matches) {
  return match(TOUCH_ONLY) && !match(ANY_FINE);
}

if (isTouchOnly()) {
  // "Pfff, just show me the page" leads only to the second cover, which has no way through, by way of a short beat (cover-beat.js). A second tap during it does nothing.
  const insist = document.getElementById('coverInsist');
  insist?.addEventListener('click', async () => {
    if (insist.disabled) return;
    insist.disabled = true;
    await playBeat(document.getElementById('cover1'), document.getElementById('cover2'));
  });
} else {
  // The page. The founder card and its QR code library went with the long page (17 Nov 2026): the workspace fills the screen now, and the landing page carries the rest.
  import('./try.js');
}
