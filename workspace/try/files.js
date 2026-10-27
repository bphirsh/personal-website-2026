/**
 * "Just files on your computer" (M-016): a split with a draggable divider, "What you see" on the left and "Saved file" on the right, switchable between a page and a database.
 *
 * A page shows rendered against its markdown. A database shows its grid against what is really saved: in Workspace every field of every row lives in the database's SQLite file (D-007), so the saved side is a `sqlite3` query and its rows as an agent reading that file sees them, never an invented markdown table.
 *
 * It uses the visitor's own first page and first database, else the example data's. Everything from the file reaches the screen as text.
 *
 * Words are from Marketing/Beta Signups/Page copy.md, "Plain files".
 */

import { renderBody } from './markdown.js';

const WORDS = {
  heading: 'Just files on your computer',
  line: 'Pages are markdown. Databases are SQLite. Both sit in your folders, easy for you and your agents to read.',
  see: 'What you see',
  saved: 'Saved file',
  page: 'Page',
  database: 'Database',
};

/**
 * Build the section into `mount`. `page` is { title, body, folder }; `db` is { name, columns, rows }.
 */
export function mountFiles(mount, page, db) {
  const section = el('section', 'files');
  section.append(el('h2', 'section-title', WORDS.heading), el('p', 'files-line', WORDS.line));

  const tabs = el('div', 'files-switch');
  tabs.setAttribute('role', 'tablist');
  const split = el('div', 'files-split');
  const left = el('div', 'files-pane files-see');
  const divider = el('div', 'files-divider');
  divider.setAttribute('role', 'separator');
  divider.setAttribute('aria-orientation', 'vertical');
  divider.setAttribute('aria-label', 'Resize');
  divider.tabIndex = 0;
  const right = el('div', 'files-pane files-saved');
  split.append(left, divider, right);
  section.append(tabs, split);
  mount.replaceChildren(section);

  let kind = 'page';
  for (const [id, label] of [['page', WORDS.page], ['database', WORDS.database]]) {
    const t = el('button', 'files-tab', label);
    t.type = 'button';
    t.setAttribute('role', 'tab');
    t.addEventListener('click', () => { kind = id; draw(); });
    tabs.appendChild(t);
  }

  function draw() {
    for (const t of tabs.children) {
      const on = t.textContent === (kind === 'page' ? WORDS.page : WORDS.database);
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', String(on));
    }
    left.replaceChildren(el('p', 'files-label', WORDS.see));
    right.replaceChildren(el('p', 'files-label', WORDS.saved));
    if (kind === 'page') {
      const rendered = el('div', 'prose files-body');
      rendered.append(el('h1', 'files-title', page.title), renderBody(page.body));
      left.appendChild(rendered);
      right.append(el('p', 'files-path', `${page.folder ? `${page.folder}/` : ''}${page.title}.md`), el('pre', 'files-raw', page.body));
    } else {
      left.appendChild(grid(db));
      const file = `${db.name}/${db.name}.sqlite`;
      right.append(el('p', 'files-path', file), el('pre', 'files-raw', sqliteView(db, file)));
    }
  }

  // The divider: drag it, or use the arrow keys; each side keeps at least a fifth.
  let share = 50;
  function setShare(v) {
    share = Math.min(80, Math.max(20, v));
    split.style.gridTemplateColumns = `${share}fr var(--space-3) ${100 - share}fr`;
    divider.setAttribute('aria-valuenow', String(Math.round(share)));
  }
  divider.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    divider.setPointerCapture(e.pointerId);
    split.classList.add('dragging');
    const move = (ev) => {
      const r = split.getBoundingClientRect();
      setShare(((ev.clientX - r.left) / r.width) * 100);
    };
    const up = () => {
      split.classList.remove('dragging');
      divider.removeEventListener('pointermove', move);
      divider.removeEventListener('pointerup', up);
    };
    divider.addEventListener('pointermove', move);
    divider.addEventListener('pointerup', up);
  });
  divider.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: -5, ArrowRight: 5 }[e.key];
    if (step) { e.preventDefault(); setShare(share + step); }
  });

  setShare(50);
  draw();
  return { section, setShare, show: (k) => { kind = k; draw(); } };
}

// The database as its grid, drawn like the demo's.
function grid(db) {
  const g = el('div', 'grid files-grid');
  const head = el('div', 'grid-header');
  db.columns.forEach((c) => head.appendChild(el('div', 'grid-head-cell', c)));
  g.appendChild(head);
  for (const r of db.rows) {
    const row = el('div', 'grid-row');
    r.forEach((c) => row.appendChild(el('div', 'grid-cell', c)));
    g.appendChild(row);
  }
  const scroll = el('div', 'grid-scroll');
  scroll.appendChild(g);
  return scroll;
}

/** What an agent sees reading the database's SQLite file: the query it would run, and sqlite3's own output. */
export function sqliteView(db, file) {
  const ident = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field';
  const columns = db.columns.map(ident);
  const table = ident(db.name);
  const cell = (v) => String(v ?? '').replace(/\n/g, ' ');
  return [
    `$ sqlite3 -header '${file}' "SELECT ${columns.join(', ')} FROM ${table}"`,
    columns.join('|'),
    ...db.rows.map((r) => r.map(cell).join('|')),
  ].join('\n');
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
