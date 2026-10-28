/**
 * The founder card (M-008, M-017): drawn in the browser, to download or copy. Nothing is stored or published, and drawing it makes no request.
 *
 * Minimal since M-017, and fitted to the new flow (Brian, 27 Oct 2026): "Workspace"; "Made by <agent>" with that agent's mark from the copied screen, the agent read from the letter's title ("To Brian, from Claude"); their name, if the file has one; "Founder #N" only with an invite code; and the try page's address beside a QR code that opens it. The example data's card says "Example" twice, as a pill and in place of a name, and never carries the parody's name, so it can't pass for a real one off the site. The QR code is drawn on the same canvas from vendor/qrcode.js, loaded with the page, and the marks from workspace/try/brand/, the same files the copied screen shows.
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

// The agents with a mark, as on the copied screen: the agent's name as the letter gives it, matched loosely, to the mark for a dark card and for a light one.
const MARKS = [
  [/^claude/i, 'Claude', 'claude-spark-clay.svg', 'claude-spark-clay.svg'],
  [/^(chat ?gpt|gpt|openai)/i, 'ChatGPT', 'openai-blossom-white.svg', 'openai-blossom-black.svg'],
  [/^grok/i, 'Grok', 'grok-logomark-light.svg', 'grok-logomark-dark.svg'],
  [/^muse/i, 'Muse', 'muse-logo.svg', 'muse-logo.svg'],
];

/** The agent who wrote the file, from its first page's title ("To Brian, from Claude"), or null. */
export function agentFromLetter(pages) {
  const m = pages?.[0]?.title?.match(/^To .+?, from (.+)$/i);
  return m ? m[1].trim() : null;
}

/** The mark for an agent's name, if the page has one: its file for a dark card and for a light one. */
export function markFor(agent) {
  const hit = agent && MARKS.find(([re]) => re.test(agent));
  return hit ? { dark: hit[2], light: hit[3] } : null;
}

const W = 1200;
const H = 630;

/** The lines the card holds, in order; a line it leaves off is null. `name` "You" is the reader's stand-in for no name, so it is left off. */
export function cardLines({ invite, name, agent, example }) {
  return {
    example: example ? WORDS.example : null,
    brand: WORDS.brand,
    madeBy: agent ? WORDS.madeBy(agent) : null,
    // The example's card never carries the parody's real name, since the PNG can leave the site (Integrator's catch, 27 Oct 2026): its large line is "Example".
    name: example ? WORDS.example : name && name !== 'You' ? name : null,
    founder: invite ? WORDS.founder(invite.slice(0, 2)) : null,
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

  // The agent's mark, loaded once from the site (both variants), then the card is drawn again with it.
  const mark = markFor(answers.agent);
  const marks = {};
  if (mark) for (const k of ['dark', 'light']) {
    const img = new Image();
    img.onload = () => { marks[k] = img; draw(); };
    img.src = `/workspace/try/brand/${mark[k]}`;
  }

  function draw() {
    const lines = cardLines(answers);
    canvas.setAttribute('aria-label', Object.values(lines).filter(Boolean).join('. '));
    paint(canvas, lines, marks);
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

function paint(canvas, lines, marks = {}) {
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
  ctx.fillStyle = t('bg');
  ctx.font = `600 40px ${font}`;
  ctx.fillText(lines.brand, x, 128);
  // "Example", on the example data's card only, beside the brand.
  if (lines.example) {
    const bx = x + ctx.measureText(lines.brand).width + 24;
    ctx.font = `600 22px ${font}`;
    const w = ctx.measureText(lines.example).width + 28;
    ctx.strokeStyle = t('accent');
    ctx.lineWidth = 2;
    roundRect(ctx, bx, 98, w, 38, 19);
    ctx.stroke();
    ctx.fillStyle = t('accent');
    ctx.fillText(lines.example, bx + 14, 125);
  }

  // Made by <agent>, with its mark when the page has one: the variant that reads on the card's ground.
  if (lines.madeBy) {
    const groundDark = luminance(t('fg')) < 0.5;
    const img = marks[groundDark ? 'dark' : 'light'];
    let tx = x;
    if (img) { ctx.drawImage(img, x, 168, 36, 36); tx = x + 50; }
    ctx.fillStyle = t('bg');
    ctx.globalAlpha = 0.9;
    ctx.font = `500 32px ${font}`;
    ctx.fillText(lines.madeBy, tx, 198);
    ctx.globalAlpha = 1;
  }

  // Their name, large; the founder number under it in the accent, when there is a code.
  let y = lines.founder ? 330 : 370;
  if (lines.name) {
    ctx.fillStyle = t('bg');
    fit(lines.name, 700, lines.founder ? 72 : 96);
    ctx.fillText(lines.name, x, y);
    y += lines.founder ? 104 : 0;
  }
  if (lines.founder) {
    ctx.fillStyle = t('accent');
    fit(lines.founder, 700, lines.name ? 84 : 128);
    ctx.fillText(lines.founder, x, lines.name ? y : 360);
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
