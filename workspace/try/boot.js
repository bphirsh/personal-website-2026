/**
 * What runs on /workspace/try. On a touch-only device (a phone or an iPad), the page is not for it (Brian, 27 Oct 2026): the two covers show and nothing of the page loads, so no drop zone, demo, replay or founder card runs. On anything else the page's scripts load as before.
 *
 * Touch-only means no hover and a coarse pointer, with no fine pointer anywhere: an iPad with a trackpad, or a touch laptop, has a fine pointer and gets the page. try.css shows the covers by the same rule, so they show before this runs.
 */

export const TOUCH_ONLY = '(hover: none) and (pointer: coarse)';
export const ANY_FINE = '(any-pointer: fine)';

export function isTouchOnly(match = (q) => matchMedia(q).matches) {
  return match(TOUCH_ONLY) && !match(ANY_FINE);
}

if (isTouchOnly()) {
  // "Pfff, just show me the page" leads only to the second cover, which has no way through.
  document.getElementById('coverInsist')?.addEventListener('click', () => {
    document.getElementById('cover1').hidden = true;
    document.getElementById('cover2').hidden = false;
  });
} else {
  // The founder card's QR code library (a plain script), then the page.
  const qr = document.createElement('script');
  qr.src = '/workspace/try/vendor/qrcode.js';
  // The card is a canvas: if it was drawn before the library arrived, draw it again with its QR code.
  qr.addEventListener('load', () => document.dispatchEvent(new CustomEvent('stylechange')));
  document.head.appendChild(qr);
  import('./try.js');
}
