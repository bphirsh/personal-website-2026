/**
 * /workspace/try — takes the dropped or chosen file, reads it here in the
 * browser, and builds the demo from it.
 *
 * The file never leaves the page: it is read with File.text() and handed to
 * invite.js, and nothing on this page makes a request carrying it. A file that
 * cannot be read replaces the drop zone with what went wrong and a box to paste
 * back to the agent; one with warnings gets the demo with a banner for each.
 * The result also goes out as an `invite-read` event on `document`, with the
 * reader's result and the file's name and text as `detail`, for the parts of
 * the page that build on it.
 *
 * Words are from Marketing/Beta Signups/Page copy.md.
 */

import { readInvite, refuseBySize, codeFromHash } from './invite.js';
import { mountDemo, filesSample } from './demo.js';
import { mountFiles } from './files.js';
import { mountReplay } from './replay.js';
import { mountButton } from './button.js';
import { mountTaps } from './taps.js';
import { mountCard } from './card.js';
import { mountStyleSwitcher } from './style.js';
import { SAMPLE_TEXT } from './sample-data.js';
import { wireGetFile, peek } from './getfile.js';

const WORDS = {
  dragging: 'Let go',
  reading: 'Reading your file…',
  errorHeading: "This file couldn't be opened",
  pasteThis: 'Paste this to your agent:',
  copy: 'Copy',
  copied: 'Copied',
  tryAnother: 'Try another file',
  sampleInstead: 'Show example data',
  dismiss: 'Dismiss',
  howToFix: 'How to fix it',
  sampleBanner: 'Example data. Copy the prompt above to see your own.',
  // Shown with the example only, always (M-022, M-023: the example is a parody about real people and companies).
  parody: 'A parody, just for fun: ChatGPT playing a dramatic royal adviser. No connection to Sam Altman, OpenAI or any company named, and nothing here is a real quote, event or claim.',
  loadMine: 'Load my file',
  // After "Reading your file…", one at a time, each replacing the last (M-014).
  loading: ['Working magic…', 'Creating your new Workspace…'],
};

// How long the loading moment lasts (M-014): long enough to anticipate, short enough not to wait. With reduced motion, one still line and a short pause.
const LOADING_MS = 3000; // Brian, fourth look: "like 3 seconds"
const LOADING_REDUCED_MS = 500;

// The sample person, Sam: made up, and read like any dropped file. Shipped with the page (sample-data.js), never fetched: a fetch on a protected preview got Vercel's sign-in redirect, and the example said the file couldn't be opened (27 Oct 2026).
const SAMPLE_NAME = 'workspace-sam.md';

const intake = document.getElementById('intake');
const drop = document.getElementById('drop');
const dropMain = document.getElementById('dropMain');
const pick = document.getElementById('pick');
const failed = document.getElementById('failed');
const banners = document.getElementById('banners');
const demo = document.getElementById('demo');
const replay = document.getElementById('replay');
const reply = document.getElementById('reply');
const card = document.getElementById('card');
const dropIdle = [...dropMain.childNodes].map((n) => n.cloneNode(true));
const sampleLink = document.getElementById('sampleLink');
const loaded = document.getElementById('loaded');
const loading = document.getElementById('loading');
const loadingLine = document.getElementById('loadingLine');
const storySections = ['story', 'figures', 'agentTools', 'signupBand', 'roadmap'].map((id) => document.getElementById(id));
const filesMount = document.getElementById('files');
const figures = document.getElementById('figures');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function setDropText(text) {
  if (text === null) dropMain.replaceChildren(...dropIdle.map((n) => n.cloneNode(true)));
  else dropMain.textContent = text;
}

async function take(file) {
  if (!file) return;
  setDropText(WORDS.reading);
  let text = '';
  let outcome = refuseBySize(file.size);
  if (!outcome) {
    try { text = await file.text(); } catch { text = null; }
    outcome = readInvite(text);
  }
  setDropText(null);
  if (outcome.ok) await anticipate().then(() => showDemo(file.name, text, outcome));
  else showError(outcome.error);
  document.dispatchEvent(new CustomEvent('invite-read', { detail: { fileName: file.name, text: outcome.ok ? text : null, ...outcome } }));
}

function reset() {
  styles?.undock();
  failed.hidden = true;
  failed.replaceChildren();
  banners.replaceChildren();
  demo.replaceChildren();
  replay.replaceChildren();
  filesMount.replaceChildren();
  reply.replaceChildren();
  card.replaceChildren();
  loaded.hidden = true;
  loading.hidden = true;
  for (const s of storySections) s.hidden = true;
  intake.hidden = false;
}

/**
 * The moment between a drop and the workspace (M-014): the drop zone goes, a mark animates and the lines change, then it resolves. Reduced motion gets the first line, still, for a short pause.
 */
function anticipate() {
  reset();
  removeIntro();
  loading.hidden = false;
  const lines = WORDS.loading;
  loadingLine.textContent = lines[0];
  const reduced = reducedMotion.matches;
  const total = reduced ? LOADING_REDUCED_MS : LOADING_MS;
  return new Promise((resolve) => {
    if (!reduced) lines.slice(1).forEach((line, i) => setTimeout(() => { loadingLine.textContent = line; }, ((i + 1) * total) / lines.length));
    setTimeout(resolve, total);
  });
}

// The workspace fills almost the whole window, with nothing above or below it in view (M-014); the rest follows on scroll.
// Once a file (or the example data) is shown, the intro leaves the page for good (M-015): the heading, its line and the drop zone. A drop on the window, or Load a different file, still opens another.
function removeIntro() {
  document.getElementById('intro')?.remove();
  document.body.classList.remove('landing');
}

// The speed bars grow once, the first time most of them are on screen; with reduced motion they are drawn at full length, still (M-016).
const growBars = new IntersectionObserver((entries) => {
  if (entries.some((e) => e.intersectionRatio >= 0.5)) {
    figures.classList.add('grown');
    growBars.disconnect();
  }
}, { threshold: [0, 0.5, 1] });
growBars.observe(figures);

// `from`, when given, is scrolled to instead of the window, so it stays in view above it.
function revealWorkspace(from) {
  removeIntro();
  placeStyles();
  // A section still waiting on its words (the speed figures) stays hidden.
  for (const s of storySections) s.hidden = s.hasAttribute('data-pending');
  const win = demo.querySelector('.win');
  if (!win) return;
  // A few pixels of ground above it, and the row above (Load a different file) fully out of view.
  const top = (from ?? win).getBoundingClientRect().top + scrollY - Math.min(Math.round(innerHeight * 0.02), 24);
  scrollTo({ top, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
}

function showError(error) {
  reset();
  intake.hidden = true;
  failed.hidden = false;
  failed.append(el('h2', 'failed-head', WORDS.errorHeading), el('p', null, error.message), pasteBox(error.pasteBack));
  const again = el('button', 'btn', WORDS.tryAnother);
  again.type = 'button';
  // Only opens the picker: the page is cleared once a file is chosen (take), so cancelling leaves this panel where it was.
  again.addEventListener('click', () => pick.click());
  const sample = el('button', 'btn btn-quiet', WORDS.sampleInstead);
  sample.type = 'button';
  sample.addEventListener('click', showSample);
  const actions = el('div', 'actions');
  actions.append(again, sample);
  failed.appendChild(actions);
}

/**
 * The sample demo: Sam's file, read like a dropped one, with the sample
 * banner over it and the three taps in place of a button built from the
 * file. No bad-invite banner (Sam has no code on purpose); the send carries
 * the link's code, else none.
 */
function showSample() {
  const text = SAMPLE_TEXT;
  const r = readInvite(text);
  if (!r.ok) return showError(r.error);
  reset();
  const b = el('div', 'banner banner-sample');
  b.setAttribute('role', 'status');
  const row = el('div', 'banner-row');
  row.appendChild(el('span', 'banner-text', WORDS.sampleBanner));
  const load = el('button', 'link', WORDS.loadMine);
  load.type = 'button';
  // As Load a different file: cancelling the picker leaves the example data where it was.
  load.addEventListener('click', () => pick.click());
  row.appendChild(load);
  b.append(row, el('p', 'banner-note', WORDS.parody));
  banners.appendChild(b);
  mountDemo(demo, r.invite, SAMPLE_NAME, text, { sample: true, full: true, letter: true });
  mountReplay(replay, r.invite, SAMPLE_NAME, text);
  mountFiles(filesMount, filesSample(r.invite).db);
  mountTaps(reply, codeFromHash(location.hash));
  // The banner and its parody line stay in view above the window, so the example is never seen without them.
  revealWorkspace(b);
}

/**
 * The invite code the page uses (M-010): the file's when it has a good one,
 * else the one after `#` in the link, else none. The `#` part never reaches
 * the server; the code is sent only when the button is pressed.
 */
function inviteCode(properties) {
  return properties.invite ?? codeFromHash(location.hash);
}

function showDemo(fileName, text, r) {
  reset();
  // Their file is in: the page is about the demo now (Brian, 27 Oct).
  intake.hidden = true;
  loaded.hidden = false;
  const invite = inviteCode(r.invite.properties);
  for (const w of r.warnings) {
    // With a code from the link, a file without one is no longer a problem.
    if (w.code === 'bad-invite' && invite) continue;
    banners.appendChild(banner(w));
  }
  mountDemo(demo, r.invite, fileName, text, { full: true, letter: true });
  mountReplay(replay, r.invite, fileName, text);
  mountFiles(filesMount, filesSample(r.invite).db);
  mountButton(reply, { ...r.invite.properties, invite });
  // The card is theirs, so only for their own file, never for the sample.
  mountCard(card, { ...r.invite.properties, invite });
  revealWorkspace();
}

function banner(w) {
  const b = el('div', 'banner');
  b.setAttribute('role', 'status');
  const row = el('div', 'banner-row');
  row.appendChild(el('span', 'banner-text', w.message));
  const dismiss = el('button', 'link', WORDS.dismiss);
  dismiss.type = 'button';
  dismiss.addEventListener('click', () => b.remove());
  // A warning with nothing to paste (bad-invite) has no "How to fix it".
  if (w.pasteBack) {
    const fix = el('button', 'link', WORDS.howToFix);
    fix.type = 'button';
    const more = el('div', 'banner-more');
    more.hidden = true;
    more.appendChild(pasteBox(w.pasteBack));
    fix.addEventListener('click', () => { more.hidden = !more.hidden; });
    row.append(fix, dismiss);
    b.append(row, more);
  } else {
    row.appendChild(dismiss);
    b.appendChild(row);
  }
  return b;
}

function pasteBox(text) {
  const wrap = el('div', 'paste-wrap');
  wrap.appendChild(el('p', 'paste-label', WORDS.pasteThis));
  wrap.appendChild(el('pre', 'paste', text));
  const copy = el('button', 'btn', WORDS.copy);
  copy.type = 'button';
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      copy.textContent = WORDS.copied;
    } catch {
      // No clipboard: select the box so a keyboard copy works.
      const range = document.createRange();
      range.selectNodeContents(wrap.querySelector('pre'));
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    }
  });
  wrap.appendChild(copy);
  return wrap;
}

pick.addEventListener('change', () => {
  take(pick.files[0]);
  pick.value = ''; // so the same file can be chosen again after fixing it
});

// The whole window takes a drop, so a near miss still lands; the zone says so
// while a file is over the page.
let depth = 0;
addEventListener('dragenter', (e) => {
  e.preventDefault();
  // A file dragged over the page moves to the drop screen, so the zone it is meant for is there.
  if (depth++ === 0) { if (step2.isConnected && step2.hidden) toStep2(!copied.hidden); drop.classList.add('over'); setDropText(WORDS.dragging); }
});
addEventListener('dragleave', () => {
  if (--depth <= 0) { depth = 0; drop.classList.remove('over'); setDropText(null); }
});
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => {
  e.preventDefault();
  depth = 0;
  drop.classList.remove('over');
  setDropText(null);
  take(e.dataTransfer?.files?.[0]);
});

const styles = mountStyleSwitcher(document.getElementById('styleSwitch'));
// Beside the preview only when the window leaves room for a column to its right; otherwise in the top bar, so the preview never moves (M-016).
const roomBeside = matchMedia('(min-width: 1260px)');
function placeStyles() {
  const wrap = demo.querySelector('.demo');
  if (wrap && roomBeside.matches) styles.dock(wrap);
  else styles.undock();
}
roomBeside.addEventListener('change', placeStyles);
sampleLink.hidden = false;
document.getElementById('loadAnother').addEventListener('click', () => pick.click());
document.getElementById('skipDemo').addEventListener('click', showSample);
// The landing's screens (Brian, 27 Oct 2026): step 1 copies the prompt. A successful copy shows the copied screen, which holds about three seconds and fades into the drop screen; Skip goes there at once. I have my file, or a file dragged over the page, goes straight to the drop screen. From the drop screen, Copy the prompt again copies it and shows the copied screen again; Use demo data opens the example, as Skip does.
const COPIED_HOLD_MS = 3000;
const FADE_MS = 240;
const step1 = sampleLink;
const copied = document.getElementById('copied');
const step2 = document.getElementById('step2');
let holdTimer = 0;
function show(screen) {
  clearTimeout(holdTimer);
  for (const s of [step1, copied, step2]) s.hidden = s !== screen;
}
function toCopied() {
  show(copied);
  holdTimer = setTimeout(() => {
    // The copied screen fades out, then the drop screen fades in (step-in); with reduced motion, neither fades and the timing is the same.
    if (reducedMotion.matches) return toStep2(true);
    copied.classList.add('leaving');
    holdTimer = setTimeout(() => { copied.classList.remove('leaving'); toStep2(true); }, FADE_MS);
  }, COPIED_HOLD_MS);
}
function toStep2(afterCopy) {
  copied.classList.remove('leaving');
  document.getElementById('step2Title').textContent = afterCopy ? "Add your agent's file" : 'Drop your file';
  show(step2);
}
document.getElementById('haveFile').addEventListener('click', () => toStep2(false));
document.getElementById('copiedSkip').addEventListener('click', () => toStep2(true));
// Copies with the same button as step 1, so a refused copy lands in step 1 with the prompt shown for selecting.
document.getElementById('copyAgain').addEventListener('click', () => document.getElementById('getFile').click());
document.getElementById('useDemo').addEventListener('click', showSample);
// A refused copy stays in step 1, with the prompt shown for selecting.
wireGetFile(document.getElementById('getFile'), document.getElementById('getFileStatus'), () => codeFromHash(location.hash), (ok) => (ok ? toCopied() : show(step1)));
document.getElementById('promptPeek').textContent = peek(codeFromHash(location.hash));
