/**
 * The share card: a founder card drawn in the browser, to download or copy
 * (M-008). Nothing is stored or published, and drawing it makes no request.
 *
 * It carries their founder number, role, what they are building (always, since M-013 changed M-008), their tools, what Workspace is and the public signup page's address. Their name is never on it.
 *
 * Words are from Marketing/Beta Signups/Page copy.md, "The share card". The
 * colours and fonts are the app's tokens, read from the page.
 */

const WORDS = {
  heading: 'Your founder card',
  sub: 'Nothing is posted.',
  founder: (n) => `Founder #${n}`,
  roles: { coder: 'Builds with code', 'knowledge-worker': 'Thinks in documents', both: 'Code and documents', other: 'Code and documents' },
  worksWith: (tools) => `Works with ${tools}`,
  more: (n) => `+${n}\u00a0more`, // a no-break space: "+2 more" never splits across lines
  what: 'Workspace — a Mac app for the files you and your agents share',
  address: 'brianhirsh.com/workspace/signup',
  building: (p) => `Building: ${p}`,
  download: 'Download image',
  copy: 'Copy image',
  copied: 'Copied',
  noCopy: "Can't copy here; use Download.",
};

const W = 1200;
const H = 630;

/** The lines the card holds, in order, for these answers. */
export function cardLines({ invite, role, ai_tools, knowledge_tools, project }) {
  const tools = [...ai_tools, ...knowledge_tools].map((t) => t.label);
  const shown = tools.slice(0, 5).join(', ') + (tools.length > 5 ? `, ${WORDS.more(tools.length - 5)}` : '');
  return {
    founder: invite ? WORDS.founder(invite.slice(0, 2)) : null,
    role: WORDS.roles[role] ?? WORDS.roles.other,
    // Always on the card since M-013 (Brian: "can't be hidden"), and drawn under the role, before the tools.
    project: project ? WORDS.building(project) : null,
    tools: tools.length ? WORDS.worksWith(shown) : null,
    what: WORDS.what,
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

  function draw() {
    const lines = cardLines(answers);
    canvas.setAttribute('aria-label', Object.values(lines).filter(Boolean).join('. '));
    paint(canvas, lines);
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

function paint(canvas, lines) {
  const css = getComputedStyle(document.documentElement);
  const t = (name) => css.getPropertyValue(`--${name}`).trim();
  const font = t('font-ui') || 'system-ui, sans-serif';
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, W, H);
  ctx.save();
  roundRect(ctx, 0, 0, W, H, 40);
  ctx.clip();
  ctx.fillStyle = t('surface');
  ctx.fillRect(0, 0, W, H);
  // The app's accent, as a band down the left edge, inside the card.
  ctx.fillStyle = t('accent');
  ctx.fillRect(0, 0, 20, H);
  ctx.restore();
  ctx.strokeStyle = t('border');
  ctx.lineWidth = 4;
  roundRect(ctx, 2, 2, W - 4, H - 4, 38);
  ctx.stroke();

  const x = 96;
  let y = 120;
  ctx.textBaseline = 'alphabetic';

  if (lines.founder) {
    ctx.fillStyle = t('accent');
    ctx.font = `600 34px ${font}`;
    ctx.fillText(lines.founder, x, y);
    y += 96;
  } else {
    y += 40;
  }

  ctx.fillStyle = t('fg');
  ctx.font = `600 76px ${font}`;
  y = wrap(ctx, lines.role, x, y, W - x * 2, 88);

  if (lines.project) {
    y += 12;
    ctx.fillStyle = t('fg');
    ctx.font = `500 36px ${font}`;
    y = wrap(ctx, lines.project, x, y, W - x * 2, 48);
  }
  if (lines.tools) {
    y += 8;
    ctx.fillStyle = t('fg-secondary');
    ctx.font = `400 32px ${font}`;
    y = wrap(ctx, lines.tools, x, y, W - x * 2, 44);
  }

  ctx.fillStyle = t('fg-secondary');
  ctx.font = `400 28px ${font}`;
  ctx.fillText(lines.what, x, H - 112);
  ctx.fillStyle = t('accent');
  ctx.font = `500 28px ${font}`;
  ctx.fillText(lines.address, x, H - 68);
}

// Draw `text` wrapped to `width`; returns the baseline after the last line.
function wrap(ctx, text, x, y, width, lineHeight) {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > width && line) {
      ctx.fillText(line, x, y);
      line = w;
      y += lineHeight;
    } else {
      line = next;
    }
  }
  if (line) ctx.fillText(line, x, y);
  return y + lineHeight;
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
