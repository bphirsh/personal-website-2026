/**
 * The founder card (M-008, M-017): drawn in the browser, to download or copy. Nothing is stored or published, and drawing it makes no request.
 *
 * Minimal since M-017, fitted to the new flow, and made fun (Brian, 27 Oct 2026): the Workspace logo and "Workspace"; one playful line, picked at random for each card; "Made by <agent>" as text, the agent read from the letter's title ("To Brian, from Claude"), with no company's logo; their name, if the file has one; "Founder #N" only with an invite code; and the try page's address beside a QR code that opens it. The example data's card has only the logo, the playful line, an "Example" label and the QR code: no name and no "Made by", so it can't pass for a real one off the site. The QR code is drawn on the same canvas from vendor/qrcode.js, loaded with the page, and the logo from workspace/media/, the same files the Workspace page shows.
 *
 * Words are from Marketing/Beta Signups/Page copy.md, "The share card". The colours and fonts are the theme's tokens, read from the page, so the card follows the style picked.
 */

const WORDS = {
  heading: 'Your founder card',
  sub: 'Nothing is posted.',
  brand: 'Workspace',
  founder: (n) => `Founder #${n}`,
  madeBy: (agent) => `Made by ${agent}`,
  example: 'Example',
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
  'Founding member of a very tidy folder.',
];

/** The agent who wrote the file, from its first page's title ("To Brian, from Claude"), or null. */
export function agentFromLetter(pages) {
  const m = pages?.[0]?.title?.match(/^To .+?, from (.+)$/i);
  return m ? m[1].trim() : null;
}

const W = 1200;
const H = 630;

/** The lines the card holds, in order; a line it leaves off is null. `name` "You" is the reader's stand-in for no name, so it is left off. */
export function cardLines({ invite, name, agent, example, fun }) {
  // The example's card names nobody and no agent, since the PNG can leave the site (27 Oct 2026).
  return {
    example: example ? WORDS.example : null,
    brand: WORDS.brand,
    fun: fun ?? FUN_LINES[0],
    madeBy: agent && !example ? WORDS.madeBy(agent) : null,
    name: !example && name && name !== 'You' ? name : null,
    founder: invite && !example ? WORDS.founder(invite.slice(0, 2)) : null,
    address: WORDS.address,
  };
}

/** Build the card section into `mount`. `answers` as for the button. */
export function mountCard(mount, answers) {
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
  const status = el('p', 'small');
  status.setAttribute('role', 'status');
  actions.append(download, copy);
  section.append(actions, status);
  mount.replaceChildren(section);

  // One playful line for this card, kept across redraws.
  const fun = FUN_LINES[Math.floor(Math.random() * FUN_LINES.length)];
  // The Workspace logo, both appearances, loaded once from the site; the card is drawn again when they arrive.
  const logos = {};
  for (const k of ['light', 'dark']) {
    const img = new Image();
    img.onload = () => { logos[k] = img; draw(); };
    img.src = `/workspace/media/workspace-logo-${k}.svg`;
  }

  function draw() {
    const lines = cardLines({ ...answers, fun });
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

  // An ink card: the theme's text colour as the ground, its page ground as the type, the accent for the number.
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
  // "Example", on the example data's card only, beside the brand.
  if (lines.example) {
    const bx = bx0 + ctx.measureText(lines.brand).width + 24;
    ctx.font = `600 22px ${font}`;
    const w = ctx.measureText(lines.example).width + 28;
    ctx.strokeStyle = t('accent');
    ctx.lineWidth = 2;
    roundRect(ctx, bx, 98, w, 38, 19);
    ctx.stroke();
    ctx.fillStyle = t('accent');
    ctx.fillText(lines.example, bx + 14, 125);
  }

  // The playful line: large on the example's card, where it is the whole card; else under the brand, above who made it.
  ctx.fillStyle = t('bg');
  if (!lines.name && !lines.founder && !lines.madeBy) {
    ctx.font = `700 56px ${font}`;
    wrapText(ctx, lines.fun, x, 290, room, 66);
  } else {
    ctx.globalAlpha = 0.9;
    fit(lines.fun, 500, 32);
    ctx.fillText(lines.fun, x, 196);
    ctx.globalAlpha = 1;
  }

  // Made by <agent>, as text only.
  if (lines.madeBy) {
    ctx.fillStyle = t('bg');
    ctx.globalAlpha = 0.7;
    ctx.font = `500 26px ${font}`;
    ctx.fillText(lines.madeBy, x, 244);
    ctx.globalAlpha = 1;
  }

  // Their name, large; the founder number under it in the accent, when there is a code.
  let y = lines.founder ? 350 : 390;
  if (lines.name) {
    ctx.fillStyle = t('bg');
    fit(lines.name, 700, lines.founder ? 72 : 96);
    ctx.fillText(lines.name, x, y);
    y += lines.founder ? 104 : 0;
  }
  if (lines.founder) {
    ctx.fillStyle = t('accent');
    fit(lines.founder, 700, lines.name ? 76 : 112);
    ctx.fillText(lines.founder, x, lines.name ? y - 10 : 380);
  }

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
