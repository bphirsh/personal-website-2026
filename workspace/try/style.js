/**
 * The style picker (M-014, M-016): "Style" and one small square per theme of the app, in its colours, with the theme's name as the square's tooltip. Picking one sets `data-style` on the page's root, and tokens.css does the rest; day or night still follows the visitor's own system setting.
 *
 * It is one element that lives in the top bar until there is a preview, then sits in a slim column to the right of the preview window, without moving or shrinking it (`dock`).
 *
 * The choice is not saved anywhere: no storage, no cookie, no address change. A reload is back to Default, which keeps the page's promise of no cookies and nothing stored.
 *
 * Words are from Marketing/Beta Signups/Page copy.md, "The style switcher"; the theme names are the app's own.
 */

import { STYLES } from './styles.js';

const WORDS = { label: 'Style' };

/** Build the picker into `home`. Returns `dock(into)` and `undock()` to move it beside a preview and back. */
export function mountStyleSwitcher(home) {
  const wrap = el('div', 'style-pick');
  wrap.setAttribute('role', 'radiogroup');
  wrap.setAttribute('aria-label', WORDS.label);
  wrap.appendChild(el('span', 'style-label', WORDS.label));
  const night = matchMedia('(prefers-color-scheme: dark)');

  const squares = STYLES.map((style) => {
    const b = el('button', 'style-square');
    b.type = 'button';
    b.title = style.name;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', style.name);
    b.addEventListener('click', () => apply(style));
    b.addEventListener('keydown', (e) => {
      const i = STYLES.indexOf(style);
      const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
      if (!step) return;
      e.preventDefault();
      const next = STYLES[(i + step + STYLES.length) % STYLES.length];
      apply(next);
      squares[STYLES.indexOf(next)].focus();
    });
    wrap.appendChild(b);
    return b;
  });

  function paint() {
    STYLES.forEach((style, i) => {
      const s = night.matches ? style.night : style.day;
      squares[i].style.background = `linear-gradient(135deg, ${s.bg} 0 50%, ${s.accent} 50% 100%)`;
    });
  }

  function apply(style) {
    if (style.id === 'default') delete document.documentElement.dataset.style;
    else document.documentElement.dataset.style = style.id;
    squares.forEach((b, i) => {
      const on = STYLES[i] === style;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    // The share card is drawn on a canvas, so it redraws itself on this.
    document.dispatchEvent(new CustomEvent('stylechange', { detail: { id: style.id } }));
  }

  night.addEventListener('change', paint);
  paint();
  home.replaceChildren(wrap);
  apply(STYLES[0]);

  return {
    apply: (id) => apply(STYLES.find((s) => s.id === id) ?? STYLES[0]),
    /** Sit in a slim column to the right of `into` (the preview's wrapper). */
    dock(into) { wrap.classList.add('docked'); into.appendChild(wrap); },
    /** Back to the top bar, before the preview it sat beside is rebuilt. */
    undock() { wrap.classList.remove('docked'); home.appendChild(wrap); },
  };
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
