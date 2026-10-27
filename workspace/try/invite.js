/**
 * The invite file reader for /workspace/try.
 *
 * Turns the markdown file a person's own agent wrote into plain data: their
 * properties, their pages, their tasks and their database tables. It runs in
 * the browser on the dropped file, and in Node for `tools/check-invite.mjs`.
 * It never touches the network and never produces HTML: every value it
 * returns is a string, a boolean or an array of those, and the page puts them
 * on screen as text (see markdown.js).
 *
 * The rules are `workspace-invite/1`, written down in
 * Marketing/Beta Signups/Invite format.md in the Agentic Workspace project.
 * That document is the agreement between the agent prompt and this page; when
 * the two disagree, it wins and this file changes.
 *
 * The page never breaks on a bad file. A gap gets a default, an unknown value
 * reads as "other", a problem the demo can live with is a warning, and the few
 * files it cannot read at all get one error. Both carry the format's code; the
 * words for each code (and what to paste back to the agent) belong to the
 * page's copy, and the ones here are placeholders until then.
 *
 * Deliberately dependency-free, like the rest of the site: the properties block
 * is read by a small YAML subset (key: value, [inline, lists], "- item" lists,
 * # comments) rather than a YAML library.
 */

export const FORMAT = 'workspace-invite/1';

export const MAX_BYTES = 200 * 1024;
export const MAX_PAGES = 10;
const MAX_NAME = 40;
const MAX_PROJECT = 60;
const MAX_TITLE = 60;
// Not in the format; caps that keep the demo a demo whatever a file holds.
const MAX_TASKS = 100;
const MAX_DATABASES = 8;
const MAX_ROWS = 200;
const MAX_COLUMNS = 12;
const MAX_LIST = 20;

export const PLATFORMS = ['mac-apple-silicon', 'mac-intel', 'mac', 'windows', 'linux', 'other'];
export const ROLES = ['coder', 'knowledge-worker', 'both'];
export const KNOWN = Object.freeze({
  ai_tools: ['claude', 'claude-code', 'chatgpt', 'codex', 'gemini', 'cursor', 'copilot', 'windsurf', 'perplexity', 'ollama'],
  knowledge_tools: ['obsidian', 'notion', 'apple-notes', 'google-docs', 'evernote', 'logseq', 'bear', 'onenote', 'word', 'confluence'],
  files_live_in: ['desktop', 'documents', 'downloads', 'icloud', 'dropbox', 'google-drive', 'onedrive', 'obsidian-vault', 'git-repos'],
});
const LIST_KEYS = Object.keys(KNOWN);
const KEYS = ['format', 'invite', 'name', 'platform', 'role', ...LIST_KEYS, 'project'];
const INVITE_RE = /^\d{2}-[a-z0-9]{4}$/;

/**
 * Placeholder words for each code, until the page copy names them. `message`
 * is for the person; `pasteBack` is what they paste to their agent.
 */
export const PROBLEMS = Object.freeze({
  'empty-file': {
    kind: 'error',
    message: 'That file is empty.',
    pasteBack: 'The invite file you gave me is empty. Please write it again in the workspace-invite/1 format, starting with the --- properties block.',
  },
  'not-text': {
    kind: 'error',
    message: "That doesn't look like a text file.",
    pasteBack: 'The file I dropped is not plain text. Please give me the invite file as a plain markdown (.md) file in the workspace-invite/1 format.',
  },
  'too-large': {
    kind: 'error',
    message: 'That file is too big to be an invite file.',
    pasteBack: 'The invite file is over 200 KB. Please write it again in the workspace-invite/1 format, keeping each page to a few short paragraphs.',
  },
  'no-properties': {
    kind: 'error',
    message: "That file doesn't start with the invite's properties.",
    pasteBack: 'The invite file has no properties block. Please put the --- block (format, invite, name, platform, role, ai_tools, knowledge_tools, files_live_in, project) at the very top, before the first # heading, and give me the file again.',
  },
  'unclosed-properties': {
    kind: 'error',
    message: 'The properties at the top of the file never end.',
    pasteBack: 'The invite file opens its properties block with a --- line but never closes it. Please add a line containing only --- after the last property, then give me the file again.',
  },
  'unknown-version': {
    kind: 'error',
    message: 'That invite file is in a format this page does not know.',
    pasteBack: 'The invite file says format: {found}. This page reads workspace-invite/1. Please rewrite the file in that format, with the line format: workspace-invite/1',
  },
  'bad-table': {
    kind: 'warning',
    message: 'The database "{name}" was left out: its table could not be read.',
    pasteBack: 'In the invite file, the "# Database: {name}" section needs one pipe table: a header row, then a separator row like | --- | --- |, then one line per row. Please fix it and give me the file again.',
  },
  'bad-invite': {
    kind: 'warning',
    message: 'Your invite code is missing. Copy it from your email into the file.',
    pasteBack: 'The invite file needs my invite code from the email, in the form 07-k3f9, on the line invite: in the properties block. Please add it and give me the file again.',
  },
});

function problem(code, vars = {}) {
  const p = PROBLEMS[code];
  const fill = (s) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
  return { code, ...vars, message: fill(p.message), pasteBack: fill(p.pasteBack) };
}

const fail = (code, vars) => ({ ok: false, error: problem(code, vars) });

/**
 * Read an invite file. Never throws.
 *
 * @param {string} text the file's contents
 * @returns {{ok: true, invite: object, warnings: object[]} | {ok: false, error: object}}
 *   a warning or error is `{code, message, pasteBack}`, plus `name` for bad-table
 */
export function readInvite(text) {
  try {
    return read(text);
  } catch {
    // A reader bug must still not break the page.
    return fail('not-text');
  }
}

/** Whether a file of this size can be read at all, before reading it. */
export function tooLarge(bytes) {
  return bytes > MAX_BYTES;
}

function read(text) {
  if (typeof text !== 'string') return fail('not-text');
  if (text.length > MAX_BYTES) return fail('too-large');
  // NUL, or the replacement character a binary file decodes to, is not text.
  if (/\u0000|�{2,}/.test(text)) return fail('not-text');

  let lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');

  // ── what the page forgives before it reads ──
  lines = withoutComments(lines);
  if (lines.every((l) => l.trim() === '')) return fail('empty-file');

  const firstHeading = lines.findIndex(isHeading);
  const limit = firstHeading === -1 ? lines.length : firstHeading;
  const open = lines.slice(0, limit).findIndex((l) => l.trim() === '---');
  if (open === -1) return fail('no-properties');

  // A fence above the properties wraps the file: drop it, and the file's last fence.
  if (lines.slice(0, open).some(isFence)) {
    let last = -1;
    for (let i = lines.length - 1; i > open; i--) if (isFence(lines[i])) { last = i; break; }
    if (last !== -1) lines = lines.slice(0, last);
  }

  const close = lines.findIndex((l, i) => i > open && l.trim() === '---');
  if (close === -1) return fail('unclosed-properties');

  // ── properties ──
  const raw = parseProperties(lines.slice(open + 1, close));
  if (raw.format !== undefined) {
    const f = scalar(raw.format).trim();
    if (f.toLowerCase() !== FORMAT) return fail('unknown-version', { found: f });
  }

  const warnings = [];
  const { pages, tasks, databases } = parseSections(lines.slice(close + 1), warnings);
  const properties = normalise(raw, pages);
  if (properties.invite === null) warnings.unshift(problem('bad-invite'));

  return { ok: true, invite: { format: FORMAT, properties, pages, tasks, databases }, warnings };
}

// HTML comments anywhere above the properties go; inside a section they are
// the page body's business (shown as text).
function withoutComments(lines) {
  const text = lines.join('\n');
  const heading = text.search(/^# /m);
  const head = heading === -1 ? text : text.slice(0, heading);
  const tail = heading === -1 ? '' : text.slice(heading);
  return (head.replace(/<!--[\s\S]*?(-->|$)/g, '') + tail).split('\n');
}

const isHeading = (l) => /^#\s/.test(l);
const isFence = (l) => /^\s*(```|~~~)/.test(l);

// ── the properties block: a small YAML subset ──

function parseProperties(lines) {
  const out = {};
  let listKey = null; // the key a run of "- item" lines belongs to
  for (const line of lines) {
    const content = stripComment(line);
    if (content.trim() === '') continue;
    const item = content.match(/^\s*-\s+(.*)$/);
    if (item && listKey) {
      out[listKey].push(unquote(item[1].trim()));
      continue;
    }
    const kv = content.match(/^\s*([A-Za-z_][\w -]*?)\s*:\s*(.*)$/);
    listKey = null;
    if (!kv) continue;
    const key = kv[1].toLowerCase().replace(/[\s-]+/g, '_');
    const value = kv[2].trim();
    // A key written twice keeps its last value.
    if (value === '') { out[key] = []; listKey = key; }
    else if (value.startsWith('[')) out[key] = parseInlineList(value);
    else out[key] = unquote(value);
  }
  return out;
}

// A `#` starts a comment outside quotes when it opens the line or follows
// white space, so `name: C#` keeps its value.
function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

function parseInlineList(value) {
  const inner = value.replace(/^\[/, '').replace(/\]\s*$/, '');
  return inner.split(',').map((s) => unquote(s.trim())).filter((s) => s !== '');
}

function unquote(s) {
  const m = s.match(/^"(.*)"$|^'(.*)'$/);
  return m ? (m[1] ?? m[2]) : s;
}

function scalar(v) {
  return Array.isArray(v) ? v.join(', ') : String(v);
}

// "Mac Apple Silicon" and "mac_apple_silicon" are mac-apple-silicon.
function token(s) {
  return String(s).trim().toLowerCase().replace(/[\s_]+/g, '-');
}

function normalise(raw, pages) {
  const has = (k) => raw[k] !== undefined && scalar(raw[k]).trim() !== '';

  const invite = has('invite') ? scalar(raw.invite).trim().toLowerCase() : null;
  const platform = has('platform') ? token(scalar(raw.platform)) : 'unknown';
  const role = has('role') ? token(scalar(raw.role)) : 'both';

  const p = {
    invite: invite && INVITE_RE.test(invite) ? invite : null,
    founder: null,
    name: has('name') ? cut(scalar(raw.name).trim(), MAX_NAME) : 'You',
    platform: platform === 'unknown' || PLATFORMS.includes(platform) ? platform : 'other',
    role: ROLES.includes(role) ? role : 'other',
    // The starting folder: `other` is laid out as both.
    layout: ROLES.includes(role) ? role : 'both',
  };
  if (p.invite) p.founder = Number(p.invite.slice(0, 2));

  for (const key of LIST_KEYS) {
    const v = raw[key];
    const items = v === undefined ? [] : Array.isArray(v) ? v : [v];
    // A known value is stored by its id; anything else is kept as written and
    // counted as other.
    p[key] = items.map((x) => String(x).trim()).filter(Boolean).slice(0, MAX_LIST).map((x) => {
      const id = token(x);
      return KNOWN[key].includes(id) ? { id, label: id, known: true } : { id: 'other', label: cut(x, 40), known: false };
    });
  }

  p.project = has('project') ? cut(scalar(raw.project).trim(), MAX_PROJECT) : pages[0]?.title ?? 'My project';
  return p;
}

// ── the sections ──

function parseSections(lines, warnings) {
  const sections = [];
  let current = null;
  let fence = false;
  for (const line of lines) {
    if (isFence(line)) fence = !fence;
    if (!fence && isHeading(line)) {
      current = { heading: line.replace(/^#\s+/, '').replace(/\s+#+\s*$/, '').trim(), lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    }
    // Anything between the properties and the first heading is ignored.
  }

  const pages = [];
  const tasks = [];
  const databases = [];
  const titled = (list, title) => {
    const n = list.filter((x) => x.base === title).length;
    return n === 0 ? title : `${title} (${n + 1})`;
  };

  for (const s of sections) {
    const m = s.heading.match(/^(page|database)\s*:\s*(.*)$/i);
    if (/^tasks$/i.test(s.heading)) {
      // A second # Tasks is added to the first.
      tasks.push(...parseTasks(s.lines));
    } else if (m && m[1].toLowerCase() === 'page') {
      const base = cut(m[2].trim(), MAX_TITLE) || 'Untitled';
      pages.push({ base, title: titled(pages, base), body: trimBlank(s.lines).join('\n') });
    } else if (m) {
      const base = cut(m[2].trim(), MAX_TITLE) || 'Untitled';
      const db = parseDatabase(s.lines);
      if (db) databases.push({ base, name: titled(databases, base), ...db });
      else warnings.push(problem('bad-table', { name: base }));
    }
    // Any other level-one heading is ignored.
  }

  return {
    pages: pages.slice(0, MAX_PAGES).map(({ title, body }) => ({ title, body })),
    tasks: tasks.slice(0, MAX_TASKS),
    databases: databases.slice(0, MAX_DATABASES).map(({ name, columns, rows }) => ({ name, columns, rows })),
  };
}

function parseTasks(lines) {
  const out = [];
  for (const line of lines) {
    const m = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/);
    if (m && m[2].trim()) out.push({ text: cut(m[2].trim(), 200), done: m[1] !== ' ' });
  }
  return out;
}

// One pipe table: header, separator, rows. Null when it isn't one.
function parseDatabase(lines) {
  const rows = lines.filter((l) => /^\s*\|/.test(l)).map(splitRow);
  if (rows.length < 2 || !rows[1].length || !rows[1].every((c) => /^\s*:?-+:?\s*$/.test(c))) return null;
  const columns = rows[0].slice(0, MAX_COLUMNS).map((c, i) => cut(c.trim(), 40) || `Column ${i + 1}`);
  const body = rows.slice(2, 2 + MAX_ROWS)
    .map((r) => columns.map((_, i) => cut((r[i] ?? '').trim(), 200)))
    .filter((cells) => cells.some((c) => c !== ''));
  return { columns, rows: body };
}

// Split a table row on unescaped pipes; `\|` is a pipe inside a cell.
function splitRow(line) {
  const cells = [];
  let cell = '';
  const s = line.trim().replace(/^\|/, '');
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') { cell += '|'; i++; }
    else if (s[i] === '|') { cells.push(cell); cell = ''; }
    else cell += s[i];
  }
  if (cell.trim() !== '') cells.push(cell);
  return cells;
}

function trimBlank(lines) {
  let a = 0;
  let b = lines.length;
  while (a < b && lines[a].trim() === '') a++;
  while (b > a && lines[b - 1].trim() === '') b--;
  return lines.slice(a, b);
}

function cut(s, n) {
  s = String(s);
  return s.length > n ? s.slice(0, n).trimEnd() : s;
}
