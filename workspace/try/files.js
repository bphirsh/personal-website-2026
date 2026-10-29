/**
 * "Easy to read, for both you and agents" (M-016, M-017, M-018): two versions of the same thing side by side, each fully visible, "What you see" and "What agents see" below, one under each. M-018 removed the reveal handle ("enough of the page is visible on both sides already").
 *
 * A page shows rendered against its markdown. A database shows its grid against what is really saved: in Workspace every field of every row lives in the database's SQLite file (D-007), so the agents' side is a `sqlite3` query and its rows as an agent reading that file sees them, never an invented markdown table.
 *
 * The page is always the one Page copy writes for it (M-017), so its syntax is there to see; the database is the visitor's own first one, else the example data's. Everything from the file reaches the screen as text.
 *
 * Words are from Marketing/Beta Signups/Page copy.md, "Plain files".
 */

import { renderBody } from './markdown.js';

// The page the comparison shows (Page copy, "Plain files"; M-017 clause 6): Sam's, written to have every bit of syntax worth seeing, so "What agents see" always shows #, **, -, [ ] and [text](url) and "What you see" their formatted forms.
export const COMPARISON_PAGE = { file: 'Interview notes to findings.md', text: "# Interview notes to findings\n\n## This week\n- **Five interviews** gathered in one folder\n- Quotes pulled out and tagged by theme\n- First draft of the findings report\n- [x] Tag every quote by theme\n- [ ] Send the draft for comments\n\nWant this for your own notes? [Get invited to v1.1](https://www.brianhirsh.com/workspace/signup/)" };

const WORDS = {
  heading: 'Easy to read, for both you and agents',
  line: 'Your agents open the same files you do. Nothing to export, nothing to convert.',
  see: 'What you see',
  agents: 'What agents see',
  page: 'Page',
  database: 'Database',
};

/**
 * Build the section into `mount`. `db` is { name, columns, rows }, the visitor's own first database or the example's; the page is always COMPARISON_PAGE.
 */
export function mountFiles(mount, db) {
  const page = COMPARISON_PAGE;
  const section = el('section', 'files');
  section.append(el('h2', 'section-title', WORDS.heading), el('p', 'files-line', WORDS.line));

  const tabs = el('div', 'files-switch');
  tabs.setAttribute('role', 'tablist');
  const frame = el('div', 'files-frame');
  const see = el('div', 'files-pane files-see');
  const agents = el('div', 'files-pane files-agents');
  see.setAttribute('aria-label', WORDS.see);
  agents.setAttribute('aria-label', WORDS.agents);
  frame.append(see, agents);
  const labels = el('div', 'files-labels');
  labels.append(el('span', null, WORDS.see), el('span', null, WORDS.agents));
  section.append(tabs, frame, labels);
  mount.replaceChildren(section);

  let kind = 'page';
  for (const [id, label] of [['page', WORDS.page], ['database', WORDS.database]]) {
    const t = el('button', 'files-tab', label);
    t.type = 'button';
    t.setAttribute('role', 'tab');
    t.dataset.kind = id;
    t.addEventListener('click', () => { kind = id; draw(); });
    tabs.appendChild(t);
  }

  function draw() {
    for (const t of tabs.children) {
      const on = t.dataset.kind === kind;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', String(on));
    }
    if (kind === 'page') {
      const rendered = el('div', 'prose files-body');
      rendered.appendChild(renderBody(page.text));
      see.replaceChildren(rendered);
      // Exactly as saved: the syntax is the point, so it is shown, never rendered.
      agents.replaceChildren(el('p', 'files-path', page.file), el('pre', 'files-raw', page.text));
    } else {
      see.replaceChildren(el('h1', 'files-title', db.name), grid(db));
      const file = `${db.name}/${db.name}.sqlite`;
      agents.replaceChildren(el('p', 'files-path', file), el('pre', 'files-raw', sqliteView(db, file)));
    }
  }

  draw();
  return { section, show: (k) => { kind = k; draw(); } };
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
