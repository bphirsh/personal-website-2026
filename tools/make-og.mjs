#!/usr/bin/env node
/**
 * make-og — draw the link-preview cards and the Workspace icons, once, as files the site keeps.
 *
 *   node tools/make-og.mjs
 *
 * Each card is a small HTML page in the site's style (the cream background, DM Serif Display and Outfit), drawn to a 1200×630 PNG in og/ by headless Chrome. Brian's own pages carry the 😁, the Workspace pages carry the Workspace mark. The words are the image text in Marketing/Beta Signups/Link previews.md: the part before the first " · " is the heading, the rest the line under it. The Workspace icons (favicon PNGs, the touch icon, the manifest icons) are drawn from workspace/media/workspace-logo-light.svg the same way, into workspace/media/. Run it again when the words or the mark change, and commit the result; nothing is drawn at deploy time.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const logo = pathToFileURL(join(root, 'workspace/media/workspace-logo-light.svg')).href;
const work = mkdtempSync(join(tmpdir(), 'make-og-'));

// From Link previews.md, "Image text", 27 Oct 2026.
export const CARDS = [
  { file: 'home.png', mark: 'brian', text: 'Brian Hirsh · Founder · Builder · Explorer', foot: 'brianhirsh.com' },
  { file: 'resume.png', mark: 'brian', text: 'Brian Hirsh · Founder · Product Leader · AI-Native Builder', foot: 'brianhirsh.com/resume' },
  { file: 'workspace.png', mark: 'workspace', text: 'A place for you + agents to collaborate', foot: 'brianhirsh.com/workspace' },
  { file: 'workspace-try.png', mark: 'workspace', text: 'See your own work in Workspace · Best on a computer', foot: 'brianhirsh.com/workspace/try' },
  { file: 'workspace-signup.png', mark: 'workspace', text: 'Request early access to Workspace', foot: 'brianhirsh.com/workspace/signup' },
  { file: 'workspace-download.png', mark: 'workspace', text: 'Workspace beta · For invited testers', foot: 'brianhirsh.com/workspace/download' },
];

const ICONS = [
  { file: 'workspace-favicon-16.png', size: 16 },
  { file: 'workspace-favicon-32.png', size: 32 },
  { file: 'workspace-apple-touch-icon.png', size: 180, solid: true },
  { file: 'workspace-icon-192.png', size: 192 },
  { file: 'workspace-icon-512.png', size: 512 },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function card({ mark, text, foot }) {
  const [head, ...rest] = text.split(' · ');
  const line = rest.join(' · ');
  const art = mark === 'brian'
    ? '<div class="emoji">😁</div>'
    : `<img class="logo" src="${logo}" alt="">`;
  return `<!doctype html><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Outfit:wght@400;500&display=block" rel="stylesheet">
<style>
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
  body { background: #F4F1EC; color: #1A1A1A; font-family: 'Outfit', sans-serif; display: flex; align-items: center; gap: 64px; padding: 0 96px; box-sizing: border-box; }
  .emoji { font-size: 220px; line-height: 1; flex: none; }
  .logo { width: 240px; height: 240px; flex: none; }
  .words { display: flex; flex-direction: column; gap: 24px; }
  h1 { font-family: 'DM Serif Display', serif; font-weight: 400; font-size: ${head.length > 24 ? 68 : 88}px; line-height: 1.08; margin: 0; letter-spacing: -0.01em; }
  p { font-size: 34px; line-height: 1.3; color: #6B6560; margin: 0; }
  .foot { position: absolute; left: 96px; bottom: 48px; font-size: 24px; color: #9B9590; letter-spacing: 0.02em; }
  .bar { position: absolute; left: 0; top: 0; width: 100%; height: 10px; background: #b8460f; }
</style>
<div class="bar"></div>
${art}
<div class="words"><h1>${esc(head)}</h1>${line ? `<p>${esc(line)}</p>` : ''}</div>
<div class="foot">${esc(foot)}</div>`;
}

function icon({ size, solid }) {
  // The touch icon is a full square (iOS rounds it, and turns transparent corners black), so the mark sits on the cream.
  return `<!doctype html><meta charset="utf-8"><style>
  html, body { margin: 0; width: ${size}px; height: ${size}px; overflow: hidden; background: ${solid ? '#F4F1EC' : 'transparent'}; }
  img { display: block; width: ${size}px; height: ${size}px; }
</style><img src="${logo}" alt="">`;
}

function draw(html, out, w, h, transparent) {
  const page = join(work, 'page.html');
  writeFileSync(page, html);
  execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    `--window-size=${w},${h}`, '--virtual-time-budget=4000', '--allow-file-access-from-files',
    ...(transparent ? ['--default-background-color=00000000'] : []),
    `--screenshot=${out}`, pathToFileURL(page).href,
  ], { stdio: 'ignore' });
  const dims = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', out], { encoding: 'utf8' }).match(/\d+/g).slice(-2).join('×');
  console.log(`${out.replace(root + '/', '')}: ${dims}, ${Math.round(statSync(out).size / 1024)} KB`);
}

for (const c of CARDS) draw(card(c), join(root, 'og', c.file), 1200, 630);
for (const i of ICONS) draw(icon(i), join(root, 'workspace/media', i.file), i.size, i.size, !i.solid);
