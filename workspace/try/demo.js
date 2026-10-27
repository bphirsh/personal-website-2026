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

const WORDS = {
  above: "This is Workspace with your file in it. Click around: it's a preview, so nothing you do here is saved.",
  hintFile: 'Your file. Workspace shows it as a page, like any other.',
  hintTasks: 'Tasks you mentioned, as a checklist.',
  hintDatabase: 'Your table, as a database page.',
  sample: 'Sample',
};

// Stand-ins for what a file left out. These are the page's own words, not the person's.
const SAMPLE = {
  page: { title: 'Welcome', body: 'A folder in Workspace is a page: its README on top, its tasks, then what it holds.\n\nYour agent writes files here, and you see them as pages and databases.' },
  research: { title: 'Reading notes', body: '## Open questions\n- What do readers want from the second chapter?\n- Which sources still need a citation?' },
  tasks: [
    { text: 'Read through the notes from last week', done: true },
    { text: 'Draft the outline', done: false },
    { text: 'Send the draft for comments', done: false },
  ],
  clients: { name: 'Clients', columns: ['Name', 'Stage', 'Next step'], rows: [['Northwind Books', 'Proposal', 'Send the deck'], ['Harbour Café', 'Signed', 'Kick-off call']] },
};

let uid = 0;
const node = (kind, name, extra = {}) => ({ id: `n${uid++}`, kind, name, ...extra });

/** The vault the demo shows, as a tree of nodes. */
export function buildVault(invite, fileName, fileText) {
  const { properties: p, pages, tasks, databases } = invite;
  const layout = p.layout;
  const coder = layout === 'coder' || layout === 'both';
  const knowledge = layout === 'knowledge-worker' || layout === 'both';

  const theirPages = pages.length ? pages.map((pg) => node('md', `${pg.title}.md`, { title: pg.title, body: pg.body })) : [node('md', `${SAMPLE.page.title}.md`, { ...SAMPLE.page, sample: true })];
  const theirTasks = node('tasks', 'tasks.md', { title: 'tasks', tasks: (tasks.length ? tasks : SAMPLE.tasks).map((t) => ({ ...t })), sample: !tasks.length, hint: tasks.length ? WORDS.hintTasks : null });
  const theirDbs = databases.map((d) => node('db', d.name, { db: d }));

  const people = node('db', 'People', {
    db: {
      name: 'People',
      columns: ['Name', 'Computer', 'Role', 'AI tools', 'Knowledge tools', 'Files live in', 'Project'],
      rows: [[p.name, p.platform, p.role, labels(p.ai_tools), labels(p.knowledge_tools), labels(p.files_live_in), p.project]],
    },
  });
  const tools = node('db', 'Tools', {
    db: {
      name: 'Tools',
      columns: ['Name', 'Kind'],
      rows: [...p.ai_tools.map((t) => [t.label, 'AI tool']), ...p.knowledge_tools.map((t) => [t.label, 'Knowledge tool'])],
    },
  });

  const root = [];
  const file = node('file', fileName, { title: fileName.replace(/\.(md|txt)$/i, ''), text: fileText, hint: WORDS.hintFile });
  let start;

  if (coder) {
    const project = node('folder', p.project, { children: [...theirPages, theirTasks, ...theirDbs], open: true });
    root.push(node('folder', 'Projects', { children: [project], open: true }));
    start = project;
  }
  if (knowledge) {
    const researchItems = coder ? [node('md', `${SAMPLE.research.title}.md`, { ...SAMPLE.research, sample: true })] : [...theirPages, theirTasks];
    const research = node('folder', 'Research', { children: researchItems, open: true });
    const clientDbs = coder || !theirDbs.length ? [node('db', 'Clients', { db: SAMPLE.clients, sample: true })] : theirDbs;
    root.push(research, node('folder', 'Clients', { children: clientDbs, open: !coder }));
    start ??= research;
  }
  root.push(people, tools, file);

  // The hint for "your table" goes on their first database, else on People.
  (theirDbs[0] ?? people).hint = WORDS.hintDatabase;

  return { root, start, file, owner: p.name };
}

function labels(list) {
  return list.map((t) => t.label).join(', ');
}

/** Build the demo window into `mount`. */
export function mountDemo(mount, invite, fileName, fileText) {
  uid = 0;
  const vault = buildVault(invite, fileName, fileText);
  const parents = new Map();
  (function index(list, parent) {
    for (const n of list) { parents.set(n.id, parent); if (n.children) index(n.children, n); }
  })(vault.root, null);

  const state = { tabs: [vault.start, vault.file], active: vault.start };

  const wrap = el('div', 'demo');
  wrap.appendChild(el('p', 'demo-above', WORDS.above));
  const win = el('div', 'win');
  win.setAttribute('role', 'region');
  win.setAttribute('aria-label', 'Workspace preview');
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
    if (n.hint) n.hint = null; // a hint leaves once clicked
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
        if (n.hint) li.appendChild(el('div', 'hint', n.hint));
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
    const title = el('h1', 'page-title', tabTitle(n));
    page.appendChild(title);
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

  function databasePage(n) {
    const out = el('div', 'dbpage');
    const strip = el('div', 'viewstrip');
    strip.appendChild(el('span', 'view active', 'Table'));
    out.appendChild(strip);
    const scroller = el('div', 'grid-scroll');
    const grid = el('table', 'grid');
    grid.setAttribute('role', 'grid');
    const head = el('tr');
    n.db.columns.forEach((c) => head.appendChild(el('th', null, c)));
    grid.appendChild(head);
    const cells = [];
    n.db.rows.forEach((r, ri) => {
      const tr = el('tr');
      cells[ri] = [];
      r.forEach((c, ci) => {
        const td = el('td', ci === 0 ? 'rowname' : null, c);
        td.tabIndex = -1;
        td.addEventListener('click', () => select(ri, ci));
        cells[ri][ci] = td;
        tr.appendChild(td);
      });
      grid.appendChild(tr);
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
    scroller.appendChild(grid);
    out.appendChild(scroller);
    if (!n.db.rows.length) out.appendChild(el('p', 'empty', 'No rows'));
    return out;
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
        if (m) { props.append(el('dt', null, m[1]), el('dd', null, m[2])); }
      }
      rest = lines.slice(close + 1);
    }
    page.appendChild(props);
    // Comments and a closing fence copied out of a chat are not part of the page.
    const body = rest.join('\n').replace(/<!--[\s\S]*?-->/g, '').replace(/\n\s*(```|~~~)[^\n]*\s*$/, '');
    page.appendChild(prose(renderBody(body)));
  }

  render();
  return wrap;
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
