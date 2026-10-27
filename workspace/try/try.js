/**
 * /workspace/try — takes the dropped or chosen file, reads it here in the
 * browser, and shows what was read.
 *
 * The file never leaves the page: it is read with File.text() and handed to
 * invite.js, and nothing on this page makes a request carrying it. The page
 * announces a read file as an `invite-read` event on `document` with the
 * reader's result as `detail`, which is where the demo takes over; until the
 * demo is built, a summary stands in for it.
 *
 * Words are placeholders until the page copy lands.
 */

import { readInvite, refuseBySize } from './invite.js';

const drop = document.getElementById('drop');
const pick = document.getElementById('pick');
const result = document.getElementById('result');

function el(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}

async function take(file) {
  if (!file) return;
  let outcome = refuseBySize(file.size);
  if (!outcome) {
    let text;
    try { text = await file.text(); } catch { text = null; }
    outcome = readInvite(text);
  }
  show(file.name, outcome);
  document.dispatchEvent(new CustomEvent('invite-read', { detail: { fileName: file.name, ...outcome } }));
}

function show(fileName, r) {
  result.replaceChildren();
  result.hidden = false;
  result.classList.toggle('error', !r.ok);

  if (!r.ok) {
    result.appendChild(el('h2', r.error.message));
    result.appendChild(el('p', 'Paste this back to your agent, then drop the new file here:'));
    result.appendChild(pasteBack(r.error.pasteBack));
    return;
  }

  const { properties: p, pages, tasks, databases } = r.invite;
  result.appendChild(el('h2', `Hello, ${p.name}`));
  const ul = el('ul');
  ul.appendChild(el('li', `${fileName}: ${pages.length} ${pages.length === 1 ? 'page' : 'pages'}, ${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}, ${databases.length} ${databases.length === 1 ? 'database' : 'databases'}`));
  ul.appendChild(el('li', `Project: ${p.project}`));
  result.appendChild(ul);
  for (const w of r.warnings) {
    result.appendChild(el('p', w.message));
    result.appendChild(pasteBack(w.pasteBack));
  }
}

function pasteBack(text) {
  const wrap = el('div');
  wrap.appendChild(el('pre', text, 'paste'));
  const copy = el('button', 'Copy', 'btn');
  copy.type = 'button';
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      copy.textContent = 'Copied';
    } catch {
      copy.textContent = 'Select the text above to copy it';
      copy.disabled = true;
    }
  });
  wrap.appendChild(copy);
  return wrap;
}

pick.addEventListener('change', () => {
  take(pick.files[0]);
  pick.value = ''; // so the same file can be chosen again after fixing it
});

// The whole window takes a drop, so a near miss still lands; the zone lights
// up while a file is over the page.
let depth = 0;
addEventListener('dragenter', (e) => { e.preventDefault(); depth++; drop.classList.add('over'); });
addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; drop.classList.remove('over'); } });
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => {
  e.preventDefault();
  depth = 0;
  drop.classList.remove('over');
  take(e.dataTransfer?.files?.[0]);
});
