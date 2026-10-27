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

import { readInvite, refuseBySize } from './invite.js';
import { mountDemo } from './demo.js';

const WORDS = {
  dragging: 'Let go to open it',
  reading: 'Reading your file…',
  errorHeading: "This file couldn't be opened",
  pasteThis: 'Paste this to your agent and it will fix the file:',
  copy: 'Copy',
  copied: 'Copied',
  tryAnother: 'Try another file',
  sampleInstead: 'Show me a sample instead',
  dismiss: 'Dismiss',
  howToFix: 'How to fix it',
  carryOn: 'Or carry on: the demo works without it.',
};

const intake = document.getElementById('intake');
const drop = document.getElementById('drop');
const dropMain = document.getElementById('dropMain');
const pick = document.getElementById('pick');
const failed = document.getElementById('failed');
const banners = document.getElementById('banners');
const demo = document.getElementById('demo');
const dropIdle = [...dropMain.childNodes].map((n) => n.cloneNode(true));

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
  if (outcome.ok) showDemo(file.name, text, outcome);
  else showError(outcome.error);
  document.dispatchEvent(new CustomEvent('invite-read', { detail: { fileName: file.name, text: outcome.ok ? text : null, ...outcome } }));
}

function reset() {
  failed.hidden = true;
  failed.replaceChildren();
  banners.replaceChildren();
  demo.replaceChildren();
  intake.hidden = false;
}

function showError(error) {
  reset();
  intake.hidden = true;
  failed.hidden = false;
  failed.append(el('h2', 'failed-head', WORDS.errorHeading), el('p', null, error.message), pasteBox(error.pasteBack));
  const again = el('button', 'btn', WORDS.tryAnother);
  again.type = 'button';
  again.addEventListener('click', () => { reset(); pick.click(); });
  const actions = el('div', 'actions');
  actions.appendChild(again);
  failed.appendChild(actions);
}

function showDemo(fileName, text, r) {
  reset();
  for (const w of r.warnings) banners.appendChild(banner(w));
  mountDemo(demo, r.invite, fileName, text);
}

function banner(w) {
  const b = el('div', 'banner');
  b.setAttribute('role', 'status');
  const row = el('div', 'banner-row');
  row.appendChild(el('span', 'banner-text', w.message));
  const fix = el('button', 'link', WORDS.howToFix);
  fix.type = 'button';
  const dismiss = el('button', 'link', WORDS.dismiss);
  dismiss.type = 'button';
  dismiss.addEventListener('click', () => b.remove());
  row.append(fix, dismiss);
  b.appendChild(row);
  const more = el('div', 'banner-more');
  more.hidden = true;
  more.appendChild(pasteBox(w.pasteBack));
  if (w.code === 'bad-invite') more.appendChild(el('p', 'small', WORDS.carryOn));
  fix.addEventListener('click', () => { more.hidden = !more.hidden; });
  b.appendChild(more);
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
  if (depth++ === 0) { drop.classList.add('over'); setDropText(WORDS.dragging); }
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
