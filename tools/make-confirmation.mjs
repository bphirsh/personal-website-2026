#!/usr/bin/env node
/**
 * make-confirmation — copy the beta-list confirmation email from the standard email template into api/_confirmation.js.
 *
 *   node tools/make-confirmation.mjs [examples folder]
 *
 * The email's source is Marketing/Email template/examples/confirmation.{html,txt} in the Agentic Workspace folder (built there by its build.py, row "A standard email look from Brian"). Its greeting holds `{{name}}`, which api/_beta-list.js fills per person. Run this again when that example changes, and commit the result; nothing is read at deploy time.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2] || '/Users/brian/Syncthing/Projects/Agentic Workspace/Marketing/Email template/examples';

const html = readFileSync(join(src, 'confirmation.html'), 'utf8');
const text = readFileSync(join(src, 'confirmation.txt'), 'utf8');
const md = readFileSync(join(src, 'confirmation.md'), 'utf8');
const subject = md.match(/^subject:\s*(.+)$/m)[1].trim();

for (const [name, body] of [['html', html], ['txt', text]]) {
  if (!body.includes('{{name}}')) throw new Error(`confirmation.${name} has no {{name}} to fill`);
}

writeFileSync(join(root, 'api/_confirmation.js'), `// Made by tools/make-confirmation.mjs from Marketing/Email template/examples/confirmation.* — edit the template, not this file.
module.exports = ${JSON.stringify({ subject, html, text }, null, 2)};
`);
console.log(`api/_confirmation.js: "${subject}", ${html.length} + ${text.length} characters`);
