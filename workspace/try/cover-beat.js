/**
 * The beat between the two covers (Brian, 27 Oct 2026: "The instant switch doesn't have the timing right"). After "Pfff, just show me the page", about two seconds of comic timing: the link fades and the 🥺 holds, as if it heard you; it trembles and swells while the cover shakes; a flash, and in the same frame the 👹 lands with a heavy bounce under it; "No!" stamps in; then the line fades in.
 *
 * Web Animations only, no library. Every step is an animation on the document timeline with its own delay, and cover 2 sits over cover 1 from the start (invisible until the flash), so the whole sequence can be paused and seeked by time. When it ends, cover 1 is hidden and the animations are dropped, leaving cover 2 exactly as it is without them. The "← Workspace" link is never moved: the shake is on the emoji and words only, and cover 2's link lands on the same spot as cover 1's. Under reduced motion it is a plain cross-fade.
 */

// When each step starts and how long it runs, in milliseconds from the tap.
export const BEAT = {
  linkOut: [0, 150],
  tremble: [350, 450],
  swell: [700, 300],
  shake: [700, 300],
  // The flash and the switch to cover 2 start on the same frame (Brian, 27 Oct: "the flash and change to devil page to happen at the same time"): the 👹 lands under the flash, which fades off it.
  flash: [1000, 220],
  swap: [1000, 1],
  devil: [1000, 420],
  stamp: [1320, 260],
  line: [1680, 260],
};
export const FADE = { out: [0, 200], in: [150, 250] };

/** How long the sequence runs, in ms: the end of its last step. */
export const length = (steps) => Math.max(...Object.values(steps).map(([at, d]) => at + d));

/**
 * Run the beat from cover 1 to cover 2. Resolves when it has finished and cover 2 stands alone. `reduced` gives the cross-fade.
 */
export function playBeat(cover1, cover2, reduced = matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const q = (cover, s) => cover.querySelector(s);
  const parent = cover1.parentElement;
  // Cover 2 over cover 1, invisible, so the swap needs no DOM change mid-sequence.
  parent.style.position = 'relative';
  Object.assign(cover2.style, { position: 'absolute', inset: '0' });
  cover2.hidden = false;

  const go = (node, frames, [delay, duration], easing = 'ease-out') => node.animate(frames, { delay, duration, easing, fill: 'both' });
  const runs = reduced
    ? [
        go(cover1, [{ opacity: 1 }, { opacity: 0 }], FADE.out),
        go(cover2, [{ opacity: 0 }, { opacity: 1 }], FADE.in),
      ]
    : beat(go, q(cover1, '.cover-emoji'), q(cover1, '.cover-body'), q(cover1, '.cover-link'), cover2, q(cover2, '.cover-emoji'), q(cover2, '.cover-head'), q(cover2, '.cover-text'));

  return Promise.all(runs.map((a) => a.finished)).catch(() => {}).then(() => {
    cover1.hidden = true;
    parent.style.position = '';
    cover2.style.position = '';
    cover2.style.inset = '';
    for (const a of runs) a.cancel();
  });
}

function beat(go, pleading, body1, link, cover2, devil, head, line) {
  const flash = document.createElement('div');
  flash.setAttribute('aria-hidden', 'true');
  Object.assign(flash.style, { position: 'fixed', inset: '0', background: 'var(--fg)', pointerEvents: 'none', zIndex: '2', opacity: '0' });
  cover2.parentElement.appendChild(flash);
  // It starts at full strength, so it fills forwards only: it is invisible until its frame.
  const fl = flash.animate([{ opacity: 0.35 }, { opacity: 0 }], { delay: BEAT.flash[0], duration: BEAT.flash[1], easing: 'ease-out', fill: 'forwards' });
  fl.finished.catch(() => {}).then(() => flash.remove());

  const jitter = (n, px, deg) => Array.from({ length: n }, (_, i) => ({ transform: `translate(${i % 2 ? px : -px}px, ${i % 3 ? 0 : px / 2}px) rotate(${i % 2 ? deg : -deg}deg)` }));
  return [
    go(link, [{ opacity: 1 }, { opacity: 0 }], BEAT.linkOut),
    // The 🥺 trembles, then swells; tremble and swell are composed so the swell keeps shaking.
    go(pleading, [{ transform: 'none' }, ...jitter(8, 2, 3), { transform: 'none' }], BEAT.tremble, 'linear'),
    go(pleading, [{ scale: '1' }, { scale: '1.5' }], BEAT.swell, 'ease-in'),
    go(body1, [{ transform: 'none' }, ...jitter(6, 6, 0.6), { transform: 'none' }], BEAT.shake, 'linear'),
    fl,
    go(cover2, [{ opacity: 0 }, { opacity: 1 }], BEAT.swap, 'step-start'),
    // The 👹 drops in heavy: too big, squashed on landing, settles.
    go(devil, [
      { transform: 'translateY(-60px) scale(0.3)', opacity: 0 },
      { transform: 'translateY(0) scale(1.3, 0.8)', opacity: 1, offset: 0.45 },
      { transform: 'translateY(-14px) scale(0.92, 1.08)', offset: 0.7 },
      { transform: 'none' },
    ], BEAT.devil, 'ease-in'),
    // "No!" slams down from large, with a slight overshoot.
    go(head, [
      { transform: 'scale(2.6)', opacity: 0 },
      { transform: 'scale(0.9)', opacity: 1, offset: 0.65 },
      { transform: 'none', opacity: 1 },
    ], BEAT.stamp, 'ease-in'),
    go(line, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], BEAT.line),
  ];
}
