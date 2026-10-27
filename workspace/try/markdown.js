/**
 * Puts a page body from an invite file on screen, safely.
 *
 * The body is written by someone else's agent, so it is never handed to the
 * browser as HTML: no innerHTML, no insertAdjacentHTML, no DOMParser. Every
 * node is made with createElement and filled with textContent, so a `<script>`
 * in a file shows as the characters "<script>". Only the little markdown a
 * page needs is understood — headings, paragraphs, lists, quotes, code, tables,
 * **bold**, *italic*, `code` and links — and links open only for http(s) and mailto.
 */

/**
 * @param {string} body markdown text from readInvite
 * @param {Document} doc the document to build nodes in
 * @returns {DocumentFragment}
 */
export function renderBody(body, doc = document) {
  const frag = doc.createDocumentFragment();
  const lines = String(body).split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') { i++; continue; }

    const fence = line.match(/^\s*(```+|~~~+)/);
    if (fence) {
      const code = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) code.push(lines[i++]);
      i++;
      const pre = el(doc, 'pre');
      pre.appendChild(el(doc, 'code', code.join('\n')));
      frag.appendChild(pre);
      continue;
    }

    const h = line.match(/^(#{1,4})\s+(.*?)\s*#*\s*$/);
    if (h) {
      const node = el(doc, `h${h[1].length}`);
      inline(node, h[2], doc);
      frag.appendChild(node);
      i++;
      continue;
    }

    if (/^\s*\|/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(cells(lines[i++]));
      const table = el(doc, 'table');
      rows.forEach((r, n) => {
        if (n === 1 && r.every((c) => /^\s*:?-+:?\s*$/.test(c))) return; // the separator row
        const tr = el(doc, 'tr');
        for (const c of r) {
          const td = el(doc, n === 0 ? 'th' : 'td');
          inline(td, c.trim(), doc);
          tr.appendChild(td);
        }
        table.appendChild(tr);
      });
      frag.appendChild(table);
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quote = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ''));
      const node = el(doc, 'blockquote');
      node.appendChild(renderBody(quote.join('\n'), doc));
      frag.appendChild(node);
      continue;
    }

    const bullet = /^\s*[-*+]\s+/;
    const number = /^\s*\d+[.)]\s+/;
    if (bullet.test(line) || number.test(line)) {
      const ordered = number.test(line);
      const marker = ordered ? number : bullet;
      const list = el(doc, ordered ? 'ol' : 'ul');
      while (i < lines.length && marker.test(lines[i])) {
        const li = el(doc, 'li');
        let text = lines[i].replace(marker, '');
        const task = text.match(/^\[([ xX])\]\s*(.*)$/);
        if (task) {
          const box = el(doc, 'input');
          box.type = 'checkbox';
          box.checked = task[1] !== ' ';
          box.disabled = true;
          li.appendChild(box);
          li.appendChild(doc.createTextNode(' '));
          text = task[2];
        }
        inline(li, text, doc);
        list.appendChild(li);
        i++;
      }
      frag.appendChild(list);
      continue;
    }

    const para = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^\s*(```|~~~|#{1,4}\s|>|\||[-*+]\s|\d+[.)]\s)/.test(lines[i])) para.push(lines[i++].trim());
    if (para.length === 0) para.push(lines[i++].trim());
    const p = el(doc, 'p');
    inline(p, para.join(' '), doc);
    frag.appendChild(p);
  }
  return frag;
}

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(\[[^\]]+\]\((?:[^()\s]|\([^()\s]*\))+\))/;

/** Append `text` to `parent`, with inline marks as elements and everything else as text. */
export function inline(parent, text, doc = document) {
  let rest = String(text);
  while (rest) {
    const m = rest.match(INLINE);
    if (!m) { parent.appendChild(doc.createTextNode(rest)); break; }
    if (m.index > 0) parent.appendChild(doc.createTextNode(rest.slice(0, m.index)));
    const tok = m[0];
    if (m[1]) parent.appendChild(el(doc, 'code', tok.slice(1, -1)));
    else if (m[2]) { const b = el(doc, 'strong'); inline(b, tok.slice(2, -2), doc); parent.appendChild(b); }
    else if (m[3]) { const e = el(doc, 'em'); inline(e, tok.slice(1, -1), doc); parent.appendChild(e); }
    else {
      const [, label, href] = tok.match(/^\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)$/);
      if (/^(https?:\/\/|mailto:)/i.test(href)) {
        const a = el(doc, 'a', label);
        a.href = href;
        a.rel = 'noopener noreferrer nofollow';
        a.target = '_blank';
        parent.appendChild(a);
      } else {
        parent.appendChild(doc.createTextNode(label));
      }
    }
    rest = rest.slice(m.index + tok.length);
  }
}

// A table row's cells; `\|` is a pipe inside a cell.
function cells(line) {
  return line.trim().replace(/^\|/, '').replace(/\|\s*$/, '').split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|'));
}

function el(doc, tag, text) {
  const node = doc.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}
