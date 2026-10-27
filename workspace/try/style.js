/**
 * The style switcher (M-014): a button that opens a menu of the app's eight themes. Picking one sets `data-style` on the page's root, and tokens.css does the rest; day or night still follows the visitor's own system setting.
 *
 * The choice is not saved anywhere: no storage, no cookie, no address change. A reload is back to Default, which keeps the page's promise of no cookies and nothing stored.
 *
 * Words are from Marketing/Beta Signups/Page copy.md, "The style switcher"; the theme names are the app's own.
 */

import { STYLES } from './styles.js';

const WORDS = {
  button: 'Change style',
};

/** Build the switcher into `mount`. */
export function mountStyleSwitcher(mount) {
  const wrap = el('div', 'style-switch');
  const button = el('button', 'style-button');
  button.type = 'button';
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');
  const current = el('span', 'style-current');
  button.append(el('span', 'style-swatch'), el('span', null, WORDS.button), current);
  const menu = el('ul', 'style-menu');
  menu.setAttribute('role', 'menu');
  menu.hidden = true;

  const night = matchMedia('(prefers-color-scheme: dark)');

  function paintSwatch(node, style) {
    const s = night.matches ? style.night : style.day;
    node.style.background = `linear-gradient(135deg, ${s.bg} 0 50%, ${s.accent} 50% 100%)`;
  }

  function apply(style) {
    if (style.id === 'default') delete document.documentElement.dataset.style;
    else document.documentElement.dataset.style = style.id;
    current.textContent = style.name;
    paintSwatch(button.querySelector('.style-swatch'), style);
    for (const li of menu.children) li.firstChild.setAttribute('aria-checked', String(li.dataset.id === style.id));
    // The share card is drawn on a canvas, so it redraws itself on this.
    document.dispatchEvent(new CustomEvent('stylechange', { detail: { id: style.id } }));
  }

  for (const style of STYLES) {
    const li = el('li');
    li.dataset.id = style.id;
    const item = el('button', 'style-item');
    item.type = 'button';
    item.setAttribute('role', 'menuitemradio');
    const sw = el('span', 'style-swatch');
    paintSwatch(sw, style);
    item.append(sw, el('span', null, style.name));
    item.addEventListener('click', () => { apply(style); close(); button.focus(); });
    li.appendChild(item);
    menu.appendChild(li);
  }

  function open() {
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    (menu.querySelector('[aria-checked="true"]') ?? menu.querySelector('button')).focus();
  }
  function close() {
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  }

  button.addEventListener('click', () => (menu.hidden ? open() : close()));
  menu.addEventListener('keydown', (e) => {
    const items = [...menu.querySelectorAll('button')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { close(); button.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  });
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) close(); });
  // The swatches follow day and night too.
  night.addEventListener('change', () => {
    for (const li of menu.children) paintSwatch(li.querySelector('.style-swatch'), STYLES.find((s) => s.id === li.dataset.id));
    paintSwatch(button.querySelector('.style-swatch'), STYLES.find((s) => s.id === (document.documentElement.dataset.style ?? 'default')));
  });

  wrap.append(button, menu);
  mount.replaceChildren(wrap);
  apply(STYLES[0]);
  return { apply: (id) => apply(STYLES.find((s) => s.id === id) ?? STYLES[0]) };
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
