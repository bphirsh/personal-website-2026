#!/usr/bin/env node
/**
 * event-qr — the QR code for a talk: the sign-up link tagged with the event, as a PNG (row "Same-day follow-up for event sign-ups", 3 Nov 2026).
 *
 *   node tools/event-qr.mjs <slug>                 # the access page: https://www.brianhirsh.com/workspace/signup/?event=<slug>
 *   node tools/event-qr.mjs <slug> --try           # the try page instead
 *   node tools/event-qr.mjs <slug> --out <file>    # where the PNG goes (default event-<slug>.png here)
 *
 * Prints the URL and writes the PNG. The slug is lower case words joined by hyphens (ai-tinkerers-nov); the confirmation and "Met at" show it as api/_events.js names it, which is printed too. Dependency-free like the rest of the site: the QR encoding (byte mode, error correction M, versions 1 to 10) and the PNG are written here.
 */

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { eventSlug, eventName } = require('../api/_events.js');

const SITE = 'https://www.brianhirsh.com';

/** The tagged link for a slug, to the access page or the try page. */
export function eventUrl(slug, page = 'signup') {
  return `${SITE}/workspace/${page === 'try' ? 'try' : 'signup'}/?event=${slug}`;
}

// ---- QR encoding ---------------------------------------------------------------

// Error correction M, by version: [ec codewords per block, [blocks, data codewords per block], ...].
const BLOCKS_M = [null,
  [10, [1, 16]], [16, [1, 28]], [26, [1, 44]], [18, [2, 32]], [24, [2, 43]],
  [16, [4, 27]], [18, [4, 31]], [22, [2, 38], [2, 39]], [22, [3, 36], [2, 37]], [26, [4, 43], [1, 44]],
];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree) {
  const out = new Array(degree).fill(0);
  out[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      out[j] = gfMul(out[j], root);
      if (j + 1 < degree) out[j] ^= out[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return out;
}

function rsRemainder(data, divisor) {
  const out = new Array(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ out.shift();
    out.push(0);
    divisor.forEach((d, i) => { out[i] ^= gfMul(d, factor); });
  }
  return out;
}

const bit = (x, i) => ((x >>> i) & 1) !== 0;

/** The QR code for `text` as rows of booleans (true is dark), without the quiet zone. */
export function qrModules(text) {
  const bytes = [...Buffer.from(text, 'utf8')];
  let version = 0;
  let capacity = 0;
  for (let v = 1; v <= 10; v++) {
    const [, ...groups] = BLOCKS_M[v];
    capacity = groups.reduce((n, [b, d]) => n + b * d, 0);
    if (4 + (v < 10 ? 8 : 16) + bytes.length * 8 <= capacity * 8) { version = v; break; }
  }
  if (!version) throw new Error(`too long for a version 10 QR code: ${bytes.length} bytes`);

  // Data codewords: byte mode, count, bytes, terminator, padding.
  const bits = [];
  const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  push(0b0100, 4);
  push(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  push(0, Math.min(4, capacity * 8 - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; data.length < capacity; pad ^= 0xec ^ 0x11) data.push(pad);

  // Blocks, each with its error correction, interleaved.
  const [ecLen, ...groups] = BLOCKS_M[version];
  const divisor = rsDivisor(ecLen);
  const blocks = [];
  let at = 0;
  for (const [count, len] of groups) {
    for (let i = 0; i < count; i++) {
      const d = data.slice(at, at + len);
      at += len;
      blocks.push({ d, ec: rsRemainder(d, divisor) });
    }
  }
  const codewords = [];
  const maxLen = Math.max(...blocks.map((b) => b.d.length));
  for (let i = 0; i < maxLen; i++) for (const b of blocks) if (i < b.d.length) codewords.push(b.d[i]);
  for (let i = 0; i < ecLen; i++) for (const b of blocks) codewords.push(b.ec[i]);

  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const fixed = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { modules[y][x] = dark; fixed[y][x] = true; };

  // Timing, finders, alignment.
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx; const y = cy + dy;
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, dist !== 2 && dist !== 4);
    }
  }
  const pos = ALIGN[version];
  pos.forEach((ax, i) => pos.forEach((ay, j) => {
    const last = pos.length - 1;
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));

  // Format bits (error correction M is 00), drawn once to reserve their modules and again for the chosen mask.
  const drawFormat = (mask) => {
    const d = mask; // (0b00 << 3) | mask
    let rem = d;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const f = ((d << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i++) set(8, i, bit(f, i));
    set(8, 7, bit(f, 6)); set(8, 8, bit(f, 7)); set(7, 8, bit(f, 8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(f, i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(f, i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(f, i));
    set(8, size - 8, true);
  };
  drawFormat(0);
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const v = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3); const b = Math.floor(i / 3);
      set(a, b, bit(v, i)); set(b, a, bit(v, i));
    }
  }

  // The codewords, in the zigzag.
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
        if (!fixed[y][x] && i < codewords.length * 8) {
          modules[y][x] = bit(codewords[i >>> 3], 7 - (i & 7));
          i++;
        }
      }
    }
  }

  // The mask with the lowest penalty.
  const MASKS = [
    (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const applyMask = (m) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fixed[y][x] && MASKS[m](x, y)) modules[y][x] = !modules[y][x];
  };
  let best = 0;
  let bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    applyMask(m);
    drawFormat(m);
    const score = penalty(modules);
    if (score < bestScore) { best = m; bestScore = score; }
    applyMask(m);
  }
  applyMask(best);
  drawFormat(best);
  return modules;
}

/** The standard's four penalty rules, for choosing a mask. */
function penalty(m) {
  const size = m.length;
  let score = 0;
  const lines = [...m, ...m[0].map((_, x) => m.map((row) => row[x]))];
  for (const line of lines) {
    // Runs of five or more.
    let run = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && line[i] === line[i - 1]) run++;
      else { if (run >= 5) score += run - 2; run = 1; }
    }
    // Finder-like 1:1:3:1:1 patterns with four light modules on a side.
    const s = line.map((d) => (d ? '1' : '0')).join('');
    for (const p of ['10111010000', '00001011101']) for (let k = s.indexOf(p); k !== -1; k = s.indexOf(p, k + 1)) score += 40;
  }
  // 2×2 blocks of one colour.
  for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
    const c = m[y][x];
    if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3;
  }
  // Balance of dark and light.
  const dark = m.flat().filter(Boolean).length;
  score += Math.floor(Math.abs((dark * 20) / (size * size) - 10)) * 10;
  return score;
}

// ---- PNG ------------------------------------------------------------------------

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** A black-on-white greyscale PNG of the modules, `scale` pixels each, with the standard four-module quiet zone. */
export function qrPng(modules, scale = 12) {
  const quiet = 4;
  const n = modules.length + quiet * 2;
  const px = n * scale;
  const raw = Buffer.alloc((px + 1) * px, 255);
  for (let y = 0; y < px; y++) {
    raw[y * (px + 1)] = 0; // no filter
    const my = Math.floor(y / scale) - quiet;
    for (let x = 0; x < px; x++) {
      const mx = Math.floor(x / scale) - quiet;
      if (my >= 0 && my < modules.length && mx >= 0 && mx < modules.length && modules[my][mx]) raw[y * (px + 1) + 1 + x] = 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(px, 0); ihdr.writeUInt32BE(px, 4);
  ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---- main -----------------------------------------------------------------------

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--out');
  const out = at === -1 ? null : args[at + 1];
  const given = args.find((a, i) => !a.startsWith('--') && (at === -1 || i !== at + 1));
  const slug = eventSlug(given);
  if (!slug) {
    console.error('usage: node tools/event-qr.mjs <slug> [--try] [--out <file.png>]   (slug: lower case words joined by hyphens, e.g. ai-tinkerers-nov)');
    process.exit(1);
  }
  const url = eventUrl(slug, args.includes('--try') ? 'try' : 'signup');
  const file = out ?? `event-${slug}.png`;
  writeFileSync(file, qrPng(qrModules(url)));
  console.log(url);
  console.log(`shown as "${eventName(slug)}" in the confirmation and in Met at`);
  console.log(`wrote ${resolve(file)}`);
}
