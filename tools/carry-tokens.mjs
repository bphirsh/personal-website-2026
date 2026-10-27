#!/usr/bin/env node
/**
 * carry-tokens — copy Workspace's design tokens into the site, as values the
 * site owns.
 *
 *   node tools/carry-tokens.mjs [<path to the app's themes folder>]
 *
 * /workspace/try is a preview of the app, so it is built from the app's own
 * tokens rather than imitated by eye. The app keeps them as one JSON file per
 * theme (light.json, dark.json) in its repository; this reads those two and
 * writes workspace/try/tokens.css: light on :root, dark under
 * prefers-color-scheme. The app's files are only read. Run it again when the
 * app's tokens change, and commit the result.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const themes = process.argv[2] ?? '/Users/brian/Syncthing/Projects/Agentic Workspace/v0/code/src/renderer/src/theme/themes';
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'workspace', 'try', 'tokens.css');

const load = (name) => JSON.parse(readFileSync(join(themes, `${name}.json`), 'utf8'));
const light = load('light');
const dark = load('dark');

const names = Object.keys(light.tokens);
const missing = names.filter((n) => !(n in dark.tokens));
if (missing.length) {
  console.error(`dark.json is missing ${missing.join(', ')}`);
  process.exit(1);
}
// The app rejects a value carrying ; { } for the same reason: it would smuggle CSS.
const unsafe = [light, dark].flatMap((t) => Object.entries(t.tokens).filter(([, v]) => /[;{}]/.test(v)).map(([k]) => k));
if (unsafe.length) {
  console.error(`unsafe token values: ${unsafe.join(', ')}`);
  process.exit(1);
}

const block = (theme, indent) => names.map((n) => `${indent}--${n}: ${theme.tokens[n]};`).join('\n');

const css = `/* Workspace's design tokens, carried over from the app by tools/carry-tokens.mjs
   on ${new Date().toISOString().slice(0, 10)}. Generated: change the app's theme files and run the
   script again rather than editing this. */

:root {
${block(light, '  ')}
  color-scheme: light;
}

@media (prefers-color-scheme: dark) {
  :root {
${block(dark, '    ')}
    color-scheme: dark;
  }
}
`;

writeFileSync(out, css);
console.log(`wrote ${out}: ${names.length} tokens, light and dark`);
