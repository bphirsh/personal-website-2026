/**
 * The Workspace-look demo: a window laid out as the app, built from a read
 * invite file.
 *
 * Named as v0/Terms.md names the app's parts: a left bar holding the tree, a
 * pane with a tab bar, and three kinds of page (folder page, markdown page,
 * database page). It is a preview: ticking a task or selecting a cell works,
 * and nothing is saved anywhere, which the line above the window says.
 *
 * The starting folder follows the role (Page copy.md, "The demo"): a coder
 * gets Projects and a folder named for their project; a knowledge worker gets
 * Research and Clients; both and other get all of these. Where the file has
 * no pages, tasks or table, sample ones stand in, labelled "Sample".
 *
 * Everything from the file reaches the screen as text, through textContent or
 * markdown.js.
 */

import { renderBody } from './markdown.js';
import { isPlaceholder } from './invite.js';

const WORDS = {
  above: 'Your file, as Workspace shows it. Click around; nothing here is saved.',
  aboveSample: "A made-up person's file. Click around; nothing here is saved.",
  sample: 'Sample',
};

// Stand-ins for what a file left out, and for folders not built from it
// (Page copy.md, "The sample's contents"). They show with the Sample chip.
const SAMPLE = {
  page: { title: 'Start here', body: 'A folder in Workspace is a page: its README, its tasks, then everything in it.\n\nWhen your agent saves a file here, it shows up at once.' },
  research: { title: 'Interview notes', body: '## What we heard\n- Three of five people keep notes in more than one app.\n- Most search their Desktop before they search their notes.\n\n## Open question\n- Which notes should an agent read first?' },
  tasks: [
    { text: "Gather last week's notes", done: true },
    { text: 'Ask the agent for a first draft', done: false },
    { text: 'Review and send the draft', done: false },
  ],
  clients: { name: 'Clients', columns: ['Name', 'Stage', 'Next step'], rows: [['Riverside Bakery', 'Proposal', 'Send the estimate'], ['Lantern Studio', 'Signed', 'Kick-off call'], ['Hollow Pine Co-op', 'First call', 'Write up the notes']] },
};

// The made-up people below the visitor's own row in People (Page copy, M-015): first names only, none meant to be anyone, the same in every demo.
const DEFAULT_PEOPLE = [
  ['Mateo', 'Mac (Apple silicon)', 'Code', 'Claude Code, Cursor', 'Obsidian', 'Git repos, Desktop', 'A CLI that tidies photo libraries'],
  ['Hana', 'Mac (Apple silicon)', 'Documents and research', 'Claude, Perplexity', 'Notion, Google Docs', 'Google Drive, Desktop', 'Research notes for a podcast series'],
  ['Kofi', 'Windows', 'Both', 'ChatGPT, Copilot', 'OneNote, Word', 'OneDrive, Documents', 'A dashboard for a five-a-side league'],
  ['Ines', 'Mac (Intel)', 'Documents and research', 'Claude', 'Bear, Apple Notes', 'iCloud', 'A guidebook to local hiking trails'],
  ['Noor', 'Mac (Apple silicon)', 'Both', 'Claude Code, Gemini', 'Logseq', 'Git repos, iCloud', 'Stock tracking for a small café'],
];

// How People shows platform and role.
const PLATFORM_NAMES = { 'mac-apple-silicon': 'Mac (Apple silicon)', 'mac-intel': 'Mac (Intel)', mac: 'Mac', windows: 'Windows', linux: 'Linux', other: 'Other', unknown: 'Not said' };
const ROLE_NAMES = { coder: 'Code', 'knowledge-worker': 'Documents and research', both: 'Both', other: 'Other' };

let uid = 0;
const node = (kind, name, extra = {}) => ({ id: `n${uid++}`, kind, name, ...extra });

/** The vault the demo shows, as a tree of nodes. */
export function buildVault(invite, fileName, fileText) {
  const { properties: p, pages, tasks, databases } = invite;
  const layout = p.layout;
  const coder = layout === 'coder' || layout === 'both';
  const knowledge = layout === 'knowledge-worker' || layout === 'both';

  const theirPages = pages.length ? pages.map((pg) => node('md', `${pg.title}.md`, { title: pg.title, body: pg.body })) : [node('md', `${SAMPLE.page.title}.md`, { ...SAMPLE.page, sample: true })];
  const theirTasks = node('tasks', 'tasks.md', { title: 'tasks', tasks: (tasks.length ? tasks : SAMPLE.tasks).map((t) => ({ ...t })), sample: !tasks.length });
  const theirDbs = databases.map((d) => node('db', d.name, { db: copyDb(d) }));

  const people = node('db', 'People', {
    db: {
      name: 'People',
      columns: ['Name', 'Computer', 'Role', 'AI tools', 'Knowledge tools', 'Files live in', 'Project'],
      rows: [[p.name, PLATFORM_NAMES[p.platform] ?? p.platform, ROLE_NAMES[p.role] ?? p.role, labels(p.ai_tools), labels(p.knowledge_tools), labels(p.files_live_in), p.project], ...DEFAULT_PEOPLE.map((r) => [...r])],
    },
  });
  const tools = node('db', 'Tools', {
    db: {
      name: 'Tools',
      columns: ['Name', 'Kind'],
      rows: [...p.ai_tools.map((t) => [t.label, 'AI tool']), ...p.knowledge_tools.map((t) => [t.label, 'Knowledge tool'])],
    },
  });

  // The left bar holds pages, databases, and folders that hold pages; a database sits in it directly, never in a folder of its own (M-016).
  const root = [];
  const dbs = [];
  const file = node('file', fileName, { title: fileName.replace(/\.(md|txt)$/i, ''), text: fileText });
  let start;

  if (coder) {
    const project = node('folder', p.project, { children: [...theirPages, theirTasks], open: true });
    root.push(node('folder', 'Projects', { children: [project], open: true }));
    start = project;
  }
  if (knowledge) {
    const researchItems = coder ? [node('md', `${SAMPLE.research.title}.md`, { ...SAMPLE.research, sample: true })] : [...theirPages, theirTasks];
    const research = node('folder', 'Research', { children: researchItems, open: true });
    root.push(research);
    start ??= research;
    // Clients: theirs when the file is a knowledge worker's, else the page's own.
    if (coder || !theirDbs.length) dbs.push(node('db', 'Clients', { db: copyDb(SAMPLE.clients), sample: true }));
  }
  root.push(...theirDbs, ...dbs, people, tools, file);

  return { root, start, file, owner: p.name, tasks: theirTasks, databases: theirDbs, tools };
}

/** The page and database "Just files on your computer" shows: the visitor's own first ones, else the same stand-ins the demo uses, with the folder the page sits in. */
export function filesSample(invite) {
  const { properties: p, pages, databases } = invite;
  const knowledgeOnly = p.layout === 'knowledge-worker';
  const page = pages[0] ? { title: pages[0].title, body: pages[0].body } : { ...SAMPLE.page };
  page.folder = knowledgeOnly ? 'Research' : `Projects/${p.project}`;
  const db = copyDb(databases[0] ?? SAMPLE.clients);
  return { page, db };
}

function copyDb(d) {
  return { ...d, columns: [...d.columns], rows: d.rows.map((r) => [...r]) };
}

function labels(list) {
  return list.map((t) => t.label).join(', ');
}

/**
 * Build the demo window into `mount`. Returns a controller the replay uses to
 * change the window as files change, each change marked with the app's
 * fading tint for something changed from outside.
 *
 * `options.above` false leaves out the line above the window, `options.sample` says the file is the made-up sample's, and `options.label` names the window region for screen readers.
 */
export function mountDemo(mount, invite, fileName, fileText, options = {}) {
  const vault = buildVault(invite, fileName, fileText);
  const parents = new Map();
  (function index(list, parent) {
    for (const n of list) {
      parents.set(n.id, parent);
      if (n.children) index(n.children, n);
    }
  })(vault.root, null);

  const state = { tabs: [vault.start, vault.file], active: vault.start, changed: null };

  const wrap = el('div', 'demo');
  // `options.full`: the window fills almost the whole screen, with no text above it (M-014).
  if (options.full) wrap.classList.add('demo-full');
  else if (options.above !== false) wrap.appendChild(el('p', 'demo-above', options.sample ? WORDS.aboveSample : WORDS.above));
  const win = el('div', 'win');
  win.setAttribute('role', 'region');
  win.setAttribute('aria-label', options.label ?? 'Workspace preview');
  const titlebar = el('div', 'win-titlebar');
  titlebar.append(el('span', 'win-dot'), el('span', 'win-dot'), el('span', 'win-dot'));
  const body = el('div', 'win-body');
  const left = el('nav', 'leftbar');
  left.setAttribute('aria-label', 'Left bar');
  const pane = el('div', 'pane');
  const tabbar = el('div', 'tabbar');
  tabbar.setAttribute('role', 'tablist');
  const page = el('div', 'page');
  pane.append(tabbar, page);
  body.append(left, pane);
  win.append(titlebar, body);
  wrap.appendChild(win);
  mount.replaceChildren(wrap);

  function open(n) {
    if (!state.tabs.includes(n)) state.tabs.push(n);
    state.active = n;
    render();
  }

  function close(n) {
    const i = state.tabs.indexOf(n);
    state.tabs.splice(i, 1);
    if (state.active === n) state.active = state.tabs[Math.max(0, i - 1)] ?? null;
    render();
  }

  function render() {
    renderTree();
    renderTabs();
    renderPage();
  }

  // ── left bar ──
  function renderTree() {
    const list = el('ul', 'tree');
    list.setAttribute('role', 'tree');
    const walk = (nodes, depth, into) => {
      for (const n of nodes) {
        const li = el('li');
        li.setAttribute('role', 'treeitem');
        const row = el('button', 'tree-row');
        row.type = 'button';
        row.style.setProperty('--depth', depth);
        if (n === state.active) row.classList.add('active');
        if (state.changed === n) row.classList.add('changed');
        const lead = el('span', 'tree-lead');
        if (n.kind === 'folder') {
          lead.textContent = n.open ? '▾' : '▸';
          lead.classList.add('chevron');
          lead.addEventListener('click', (e) => { e.stopPropagation(); n.open = !n.open; renderTree(); });
          li.setAttribute('aria-expanded', String(!!n.open));
        } else if (n.kind === 'db') {
          lead.appendChild(dbMark());
        }
        row.append(lead, el('span', 'tree-name', n.name));
        if (n.sample) row.appendChild(el('span', 'chip', WORDS.sample));
        row.addEventListener('click', () => open(n));
        li.appendChild(row);
        if (n.kind === 'folder' && n.open) {
          const sub = el('ul', 'tree');
          sub.setAttribute('role', 'group');
          walk(n.children, depth + 1, sub);
          li.appendChild(sub);
        }
        into.appendChild(li);
      }
    };
    walk(vault.root, 0, list);
    const head = el('div', 'leftbar-head', `${vault.owner === 'You' ? 'Your' : `${vault.owner}'s`} vault`);
    left.replaceChildren(head, list);
  }

  // ── tab bar ──
  function renderTabs() {
    tabbar.replaceChildren();
    for (const n of state.tabs) {
      const tab = el('div', 'tab');
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(n === state.active));
      if (n === state.active) tab.classList.add('active');
      const label = el('button', 'tab-label', tabTitle(n));
      label.type = 'button';
      label.addEventListener('click', () => open(n));
      const x = el('button', 'tab-close', '×');
      x.type = 'button';
      x.setAttribute('aria-label', `Close ${tabTitle(n)}`);
      x.addEventListener('click', () => close(n));
      tab.append(label, x);
      tabbar.appendChild(tab);
    }
  }

  // ── the page ──
  function renderPage() {
    page.replaceChildren();
    const n = state.active;
    if (!n) return;
    page.dataset.kind = n.kind;
    page.appendChild(breadcrumbs(n));
    // A database page carries its own, smaller title in its header, as the app's does.
    if (n.kind !== 'db') page.appendChild(el('h1', 'page-title', tabTitle(n)));
    if (n.kind === 'folder') folderPage(n);
    else if (n.kind === 'md') page.appendChild(prose(renderBody(n.body)));
    else if (n.kind === 'tasks') page.appendChild(checklist(n));
    else if (n.kind === 'db') page.appendChild(databasePage(n));
    else if (n.kind === 'file') filePage(n);
    page.scrollTop = 0;
  }

  function breadcrumbs(n) {
    const trail = [];
    for (let p = parents.get(n.id); p; p = parents.get(p.id)) trail.unshift(p);
    const bar = el('div', 'crumbs');
    for (const p of trail) {
      const b = el('button', 'crumb', p.name);
      b.type = 'button';
      b.addEventListener('click', () => open(p));
      bar.append(b, el('span', 'crumb-sep', '/'));
    }
    return bar;
  }

  function folderPage(n) {
    const sec = el('section', 'section');
    sec.appendChild(el('h2', 'section-head', 'Contents'));
    const ul = el('ul', 'contents');
    for (const c of n.children) {
      const li = el('li');
      const b = el('button', 'contents-row');
      b.type = 'button';
      if (c.kind === 'db') b.appendChild(dbMark());
      b.appendChild(el('span', null, c.kind === 'folder' ? `${c.name}/` : c.name));
      if (c.sample) b.appendChild(el('span', 'chip', WORDS.sample));
      b.addEventListener('click', () => open(c));
      li.appendChild(b);
      ul.appendChild(li);
    }
    sec.appendChild(ul);
    const tasks = n.children.find((c) => c.kind === 'tasks');
    if (tasks) {
      const t = el('section', 'section');
      t.appendChild(el('h2', 'section-head', 'tasks'));
      t.appendChild(checklist(tasks));
      page.appendChild(t);
    }
    page.appendChild(sec);
  }

  function checklist(n) {
    const ul = el('ul', 'checklist');
    n.tasks.forEach((t) => {
      const li = el('li');
      const label = el('label', t.done ? 'done' : null);
      if (state.changed === t) li.classList.add('changed');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = t.done;
      box.addEventListener('change', () => { t.done = box.checked; label.classList.toggle('done', t.done); });
      label.append(box, el('span', null, t.text));
      li.appendChild(label);
      ul.appendChild(li);
    });
    return prose(ul);
  }

  // A database page, drawn as the app's is (v0 ui/db: DatabasePage, Grid,
  // BoardView, ListView, CardProp): a title, a view strip of Table, Board and
  // List, then the view. Options carry no colour in the app, so none here.
  function databasePage(n) {
    const out = el('div', 'db-page');
    const header = el('header', 'db-header');
    header.appendChild(el('h1', 'db-title', n.db.name));
    out.appendChild(header);

    const fields = fieldTypes(n.db);
    const groupBy = boardField(n.db, fields);
    n.view ??= 'table';

    const toolbar = el('div', 'db-toolbar');
    const views = el('div', 'db-views');
    views.setAttribute('role', 'tablist');
    const body = el('div', 'db-view');
    for (const [id, label] of [['table', 'Table'], ['board', 'Board'], ['list', 'List']]) {
      const tab = el('button', `db-view-tab${n.view === id ? ' active' : ''}`);
      tab.type = 'button';
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(n.view === id));
      tab.append(icon(ICONS[id], 'db-view-icon'), el('span', null, label));
      tab.addEventListener('click', () => {
        n.view = id;
        for (const t of views.children) {
          const on = t === tab;
          t.classList.toggle('active', on);
          t.setAttribute('aria-selected', String(on));
        }
        show();
      });
      views.appendChild(tab);
    }
    toolbar.appendChild(views);
    out.append(toolbar, body);
    // An empty database says "No rows" (Page copy) in every view, in place of
    // an empty grid or a lone empty column, and so needs no count.
    if (n.db.rows.length) out.appendChild(el('p', 'db-count', `${n.db.rows.length} ${n.db.rows.length === 1 ? 'row' : 'rows'}`));

    function show() {
      if (!n.db.rows.length) return body.replaceChildren(el('p', 'db-empty', 'No rows'));
      body.replaceChildren(n.view === 'board' ? board(n.db, fields, groupBy) : n.view === 'list' ? list(n.db, fields) : grid(n.db, fields));
    }
    show();
    return out;
  }

  function grid(db, fields) {
    const g = el('div', 'grid');
    g.setAttribute('role', 'grid');
    const head = el('div', 'grid-header');
    head.setAttribute('role', 'row');
    head.appendChild(el('div', 'grid-gutter'));
    db.columns.forEach((c, i) => {
      const h = el('div', 'grid-head-cell');
      h.setAttribute('role', 'columnheader');
      h.append(icon(ICONS[fields[i]], 'grid-head-icon'), el('span', 'grid-head-text', c));
      head.appendChild(h);
    });
    g.appendChild(head);
    const cells = [];
    db.rows.forEach((r, ri) => {
      const row = el('div', 'grid-row');
      row.setAttribute('role', 'row');
      if (state.changed === r) row.classList.add('changed');
      row.appendChild(el('div', 'grid-gutter'));
      cells[ri] = [];
      r.forEach((c, ci) => {
        const cell = el('div', `grid-cell${fields[ci] === 'number' ? ' align-right' : ''}`);
        cell.setAttribute('role', 'gridcell');
        cell.tabIndex = -1;
        if (ci === 0) cell.appendChild(icon(ICONS.page, 'cell-mark'));
        cell.appendChild(el('span', 'cell-text', c));
        cell.addEventListener('click', () => select(ri, ci));
        cells[ri][ci] = cell;
        row.appendChild(cell);
      });
      g.appendChild(row);
    });
    let sel = null;
    function select(ri, ci) {
      if (!cells[ri]?.[ci]) return;
      sel?.classList.remove('selected');
      sel = cells[ri][ci];
      sel.classList.add('selected');
      sel.focus();
      sel.onkeydown = (e) => {
        const move = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
        if (move) { e.preventDefault(); select(ri + move[0], ci + move[1]); }
      };
    }
    const scroller = el('div', 'grid-scroll');
    scroller.appendChild(g);
    return scroller;
  }

  // Columns of cards, one per value of the grouping field, then "No {field}"
  // last, as the app's board does. Without a select field, everything is in
  // the one column.
  function board(db, fields, groupBy) {
    const b = el('div', 'board');
    const groups = new Map();
    if (groupBy !== -1) for (const r of db.rows) if (r[groupBy]) groups.set(r[groupBy], []);
    const none = [];
    for (const r of db.rows) (groupBy !== -1 && r[groupBy] ? groups.get(r[groupBy]) : none).push(r);
    const columns = [...groups.entries()].map(([label, rows]) => ({ label, rows }));
    columns.push({ label: groupBy === -1 ? db.name : `No ${db.columns[groupBy]}`, rows: none, quiet: groupBy !== -1 });
    for (const c of columns) {
      const col = el('section', 'board-col');
      const head = el('header', 'board-col-head');
      head.append(el('span', `board-col-label${c.quiet ? ' quiet' : ''}`, c.label), el('span', 'board-col-count', String(c.rows.length)));
      const cards = el('div', 'board-cards');
      for (const r of c.rows) {
        const card = el('div', 'board-card');
        if (state.changed === r) card.classList.add('changed');
        card.appendChild(el('div', 'board-card-title', r[0] || 'Untitled'));
        const props = el('div', 'board-card-props');
        r.forEach((v, i) => {
          if (i === 0 || i === groupBy || !v) return;
          props.appendChild(prop(fields[i], db.columns[i], v, 'on-board'));
        });
        if (props.children.length) card.appendChild(props);
        cards.appendChild(card);
      }
      col.append(head, cards);
      b.appendChild(col);
    }
    return b;
  }

  function list(db, fields) {
    const l = el('div', 'list');
    for (const r of db.rows) {
      const row = el('div', 'list-row');
      if (state.changed === r) row.classList.add('changed');
      row.append(icon(ICONS.page, 'list-icon'), el('span', 'list-title', r[0] || 'Untitled'));
      r.forEach((v, i) => { if (i && v) row.appendChild(prop(fields[i], db.columns[i], v, 'on-list')); });
      l.appendChild(row);
    }
    return l;
  }

  // One property on a card or a list row, as the app's CardProp draws it:
  // a select as a neutral pill, a number or date as the bare value, anything
  // else as "Label: value".
  function prop(type, label, value, where) {
    const p = el('div', `card-prop ${where}`);
    if (type === 'select') {
      const pills = el('span', 'card-prop-pills');
      pills.appendChild(el('span', 'card-prop-pill', value));
      p.appendChild(pills);
    } else if (type === 'number' || type === 'date') {
      p.appendChild(el('span', 'card-prop-value', value));
    } else {
      p.appendChild(el('span', 'card-prop-text', `${label}: ${value}`));
    }
    return p;
  }

  // Their own file, as a markdown page: its properties as rows under the
  // title, then the rest of the file.
  function filePage(n) {
    const lines = n.text.replace(/\r\n?/g, '\n').split('\n');
    const open = lines.findIndex((l) => l.trim() === '---');
    const close = lines.findIndex((l, i) => i > open && l.trim() === '---');
    const props = el('dl', 'props');
    let rest = lines;
    if (open !== -1 && close !== -1) {
      for (const l of lines.slice(open + 1, close)) {
        const m = l.match(/^\s*([\w-]+)\s*:\s*(.*?)\s*(#.*)?$/);
        // A property left as an unfilled placeholder ({{name}}) is missing, so it is not shown.
        if (m && !isPlaceholder(m[2])) { props.append(el('dt', null, m[1]), el('dd', null, m[2])); }
      }
      rest = lines.slice(close + 1);
    }
    page.appendChild(props);
    // Comments and a closing fence copied out of a chat are not part of the page.
    const body = rest.join('\n').replace(/<!--[\s\S]*?-->/g, '').replace(/\n\s*(```|~~~)[^\n]*\s*$/, '');
    page.appendChild(prose(renderBody(body)));
  }

  render();

  return {
    element: wrap,
    /** The first open task, or null when every task is ticked. */
    firstOpenTask: () => vault.tasks.tasks.find((t) => !t.done) ?? null,
    /** Tick a task and show tasks.md. */
    tick(task) {
      task.done = true;
      state.changed = task;
      open(vault.tasks);
    },
    /** Add a markdown page to the starting folder and show it. */
    addPage(title, body) {
      const n = node('md', `${title}.md`, { title, body });
      vault.start.children.push(n);
      parents.set(n.id, vault.start);
      state.changed = n;
      open(n);
    },
    /** The database a new row goes in: their first, else Tools. */
    rowTarget: () => vault.databases[0] ?? vault.tools,
    /** Add a row to a database and show it. */
    addRow(dbNode, cells) {
      const row = dbNode.db.columns.map((_, i) => cells[i] ?? '');
      dbNode.db.rows.push(row);
      state.changed = row;
      open(dbNode);
    },
    /** Show a node without marking anything. */
    show(n) { state.changed = null; open(n); },
    start: vault.start,
  };
}

// The app's icons (v0 ui/db/dbicons.ts): 24-unit paths, stroked.
const ICONS = {
  table: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14',
  board: 'M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v11h-4z',
  list: 'M4 6h2M9 6h11M4 12h2M9 12h11M4 18h2M9 18h11',
  text: 'M4 6h16M4 11h16M4 16h10',
  number: 'M9 4L7 20M17 4l-2 16M4 9h16M3 15h16',
  select: 'M6 9l6 6 6-6',
  date: 'M5 6h14v14H5zM5 10h14M9 4v4M15 4v4',
  page: 'M7 3h7l5 5v13H7zM14 3v5h5',
};

function icon(path, cls) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', `icon ${cls}`);
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', path);
  svg.appendChild(p);
  return svg;
}

/**
 * A type for each column, read from its values, since an invite file's table
 * declares none: numbers, dates (2026-09, 2026-10-02), selects (a field like
 * Status, or short values that repeat), and text for the rest. The first
 * column is the row's name.
 */
export function fieldTypes(db) {
  return db.columns.map((name, i) => {
    if (i === 0) return 'text';
    const values = db.rows.map((r) => r[i]).filter(Boolean);
    if (!values.length) return 'text';
    if (values.every((v) => /^-?\d+(\.\d+)?$/.test(v))) return 'number';
    if (values.every((v) => /^\d{4}-\d{2}(-\d{2})?$/.test(v))) return 'date';
    if (/^(status|stage|kind|type|state|role|computer)$/i.test(name)) return 'select';
    const distinct = new Set(values);
    if (values.length >= 3 && distinct.size < values.length && values.every((v) => v.length <= 24)) return 'select';
    return 'text';
  });
}

// The field a board groups by, as the app picks it: a select named Status,
// else the first select; -1 when there is none.
export function boardField(db, fields) {
  const status = db.columns.findIndex((c, i) => fields[i] === 'select' && /^status$/i.test(c));
  return status !== -1 ? status : fields.indexOf('select');
}

function tabTitle(n) {
  return n.title ?? n.name.replace(/\.md$/i, '');
}

function prose(child) {
  const d = el('div', 'prose');
  d.appendChild(child);
  return d;
}

function dbMark() {
  // The database mark: the one icon the left bar uses, because a database behaves differently.
  const s = el('span', 'dbmark');
  s.setAttribute('aria-hidden', 'true');
  return s;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
