/**
 * The founder card (M-008, M-017): drawn in the browser, to download or copy. Nothing is stored or published, and drawing it makes no request.
 *
 * One card for everyone (Brian, 28 Oct 2026), their own file or the example alike: the Workspace logo and "Workspace", "Founding beta tester", one playful line, and the try page's address beside a QR code that opens it. No name, no "Made by" and no founder number, on any card. "↻ New line" swaps in another playful line, never the one just shown, through all of them before any repeats. The QR code is drawn on the same canvas from vendor/qrcode.js, loaded with the page, and the logo from workspace/media/, the same files the Workspace page shows.
 *
 * Words are from Marketing/Beta Signups/Page copy.md, "The share card". The colours and fonts are the theme's tokens, read from the page, so the card follows the style picked.
 */

const WORDS = {
  heading: 'Your founder card',
  sub: 'Nothing is posted.',
  brand: 'Workspace',
  tag: 'Founding beta tester',
  newLine: '↻ New line',
  address: 'brianhirsh.com/workspace/try',
  download: 'Download image',
  copy: 'Copy image',
  copied: 'Copied',
  noCopy: "Can't copy here; use Download.",
};

// What the QR code opens: the try page, where anyone can make their own (Brian, 27 Oct 2026).
export const TRY_URL = 'https://www.brianhirsh.com/workspace/try/';

// The playful lines, one picked at random for each card (Page copy, "The share card").
export const FUN_LINES = [
  'My agent and I share a folder now.',
  'Plain files. Fancy friends.',
  'Built by an agent. Approved by me.',
  'Every note in its place. Mostly.',
  'Fresh workspace, still warm.',
  'My files finally have a nice home.',
  'Two of us work here: me and my agent.',
  'Proud keeper of a very tidy folder.',
];

const W = 1200;
const H = 630;

/**
 * The playful lines in a shuffled order, a fresh shuffle each time round, never starting a round with the line that ended the last: `next()` gives every line once before any repeats, and never the same line twice in a row. `random` is Math.random unless a test passes its own.
 */
export function lineCycle(lines = FUN_LINES, random = Math.random) {
  let order = [];
  let last = null;
  const shuffle = () => {
    const a = [...lines];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    if (a.length > 1 && a[0] === last) [a[0], a[1]] = [a[1], a[0]];
    return a;
  };
  return { next() { if (!order.length) order = shuffle(); last = order.shift(); return last; } };
}

/** The lines the card holds, in order: the same for everyone, so nothing about the visitor or their file is on it. */
export function cardLines({ fun } = {}) {
  return { brand: WORDS.brand, tag: WORDS.tag, fun: fun ?? FUN_LINES[0], address: WORDS.address };
}

/** Build the card section into `mount`. */
export function mountCard(mount) {
  const section = el('section', 'card');
  section.append(el('h2', 'card-head', WORDS.heading), el('p', 'card-sub', WORDS.sub));

  const canvas = el('canvas', 'card-canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.setAttribute('role', 'img');
  section.appendChild(canvas);


  const actions = el('div', 'actions');
  const download = el('button', 'btn', WORDS.download);
  download.type = 'button';
  const copy = el('button', 'btn btn-quiet', WORDS.copy);
  copy.type = 'button';
  const newLine = el('button', 'btn btn-quiet', WORDS.newLine);
  newLine.type = 'button';
  newLine.addEventListener('click', () => { fun = cycle.next(); draw(); });
  const status = el('p', 'small');
  status.setAttribute('role', 'status');
  actions.append(download, copy, newLine);
  section.append(actions, status);
  mount.replaceChildren(section);

  // One playful line for this card, kept across redraws; "↻ New line" moves to the next in the cycle.
  const cycle = lineCycle();
  let fun = cycle.next();
  // The Workspace logo, both appearances, loaded once from the site; the card is drawn again when they arrive.
  const logos = {};
  for (const k of ['light', 'dark']) {
    const img = new Image();
    img.onload = () => { logos[k] = img; draw(); };
    img.src = `/workspace/media/workspace-logo-${k}.svg`;
  }

  function draw() {
    const lines = cardLines({ fun });
    canvas.setAttribute('aria-label', Object.values(lines).filter(Boolean).map((l) => l.replace(/\.$/, '')).join('. '));
    paint(canvas, lines, logos);
    copy.textContent = WORDS.copy;
  }

  download.addEventListener('click', () => {
    canvas.toBlob((blob) => {
      // An object URL for a blob made here: nothing is fetched or sent.
      const url = URL.createObjectURL(blob);
      const a = el('a');
      a.href = url;
      a.download = 'workspace-founder-card.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  });
  copy.addEventListener('click', async () => {
    status.textContent = '';
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('unsupported');
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      copy.textContent = WORDS.copied;
    } catch {
      status.textContent = WORDS.noCopy;
    }
  });

  // Its colours are the page's tokens, so a new style (or day turning to night) redraws it.
  document.addEventListener('stylechange', draw);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
  // System fonts are ready at once; draw again after layout settles anyway.
  draw();
  document.fonts?.ready?.then(draw);
  return { canvas, redraw: draw };
}

function paint(canvas, lines, logos = {}) {
  const css = getComputedStyle(document.documentElement);
  const t = (name) => css.getPropertyValue(`--${name}`).trim();
  const font = t('font-ui') || 'system-ui, sans-serif';
  const ctx = canvas.getContext('2d');

  // An ink card: the theme's text colour as the ground, its page ground as the type, the accent for the tag.
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  roundRect(ctx, 0, 0, W, H, 40);
  ctx.clip();
  ctx.fillStyle = t('fg');
  ctx.fillRect(0, 0, W, H);
  // A quiet ring of the accent in one corner, for some depth without a picture.
  ctx.strokeStyle = t('accent');
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 2;
  for (let r = 180; r <= 540; r += 60) { ctx.beginPath(); ctx.arc(0, H, r, -Math.PI / 2, 0); ctx.stroke(); }
  ctx.globalAlpha = 1;
  ctx.restore();

  const x = 88;
  const qrLeft = W - 300 - 88 - 20;
  const room = qrLeft - x - 40;
  // As large as fits in the space left of the QR code, from `size` down.
  const fit = (text, weight, size) => { do { ctx.font = `${weight} ${size}px ${font}`; size -= 2; } while (ctx.measureText(text).width > room && size > 20); };
  ctx.textBaseline = 'alphabetic';
  // The Workspace logo, in the appearance that reads on the card's ground, then the name beside it.
  const groundDark = luminance(t('fg')) < 0.5;
  const logo = logos[groundDark ? 'dark' : 'light'];
  let bx0 = x;
  if (logo) { ctx.drawImage(logo, x - 6, 80, 64, 64); bx0 = x + 70; }
  ctx.fillStyle = t('bg');
  ctx.font = `600 40px ${font}`;
  ctx.fillText(lines.brand, bx0, 128);

  // "Founding beta tester" in the accent, then the playful line, large, over up to two lines.
  ctx.fillStyle = t('accent');
  fit(lines.tag, 600, 36);
  ctx.fillText(lines.tag, x, 226);
  ctx.fillStyle = t('bg');
  ctx.font = `700 60px ${font}`;
  wrapText(ctx, lines.fun, x, 330, room, 70);

  ctx.fillStyle = t('bg');
  ctx.globalAlpha = 0.8;
  ctx.font = `500 30px ${font}`;
  ctx.fillText(lines.address, x, H - 88);
  ctx.globalAlpha = 1;

  // The QR code, dark on light so any phone reads it, with its quiet zone.
  const qr = makeQr(TRY_URL);
  if (qr) {
    const size = 300;
    const qx = W - size - 88;
    const qy = (H - size) / 2;
    // Dark modules on a light ground in every theme and at night, since not every phone reads an inverted code.
    const [dark, light] = luminance(t('fg')) < luminance(t('bg')) ? [t('fg'), t('bg')] : [t('bg'), t('fg')];
    ctx.fillStyle = light;
    roundRect(ctx, qx - 20, qy - 20, size + 40, size + 40, 24);
    ctx.fill();
    const n = qr.getModuleCount();
    const cell = size / n;
    ctx.fillStyle = dark;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) ctx.fillRect(qx + c * cell, qy + r * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
  }
}

// Relative luminance of a #rrggbb colour (tokens are hex), enough to tell the darker of two.
function luminance(hex) {
  const m = String(hex).trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return 0.5;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// The QR library is a plain script that defines `qrcode`; null if it has not loaded.
function makeQr(text) {
  const make = globalThis.qrcode;
  if (typeof make !== 'function') return null;
  const qr = make(0, 'M');
  qr.addData(text);
  qr.make();
  return qr;
}

// Text over up to two lines, broken at a space, in the current font.
function wrapText(ctx, text, x, y, width, lineHeight) {
  const words = text.split(' ');
  let line = '';
  const lines = [];
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > width && line) { lines.push(line); line = w; } else line = next;
  }
  lines.push(line);
  lines.slice(0, 2).forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
