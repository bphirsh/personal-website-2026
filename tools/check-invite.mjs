#!/usr/bin/env node
/**
 * check-invite — run the /workspace/try reader over invite files and print
 * what it read, or the problem it found.
 *
 *   node tools/check-invite.mjs <file|folder>…   a folder means every .md and .txt in it
 *   node tools/check-invite.mjs --json <file>…    the reader's whole result
 *
 * It uses the very module the page loads (workspace/try/invite.js), so what it
 * prints is what the page will get.
 *
 * A test file says in its opening comment what it expects (Invite format.md,
 * "Test files"). Where that comment names problem codes, they are checked: a
 * file naming an error must give exactly that error, and any other file must
 * build a demo with exactly the warnings it names, so an `ok-` file naming
 * none must raise none. The rest of the comment (folders, buttons) is the
 * demo's to meet and is printed for reading, not checked. The exit code is 1
 * when a check fails or a path cannot be read.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readInvite, PROBLEMS } from '../workspace/try/invite.js';
import { SAMPLE_TEXT } from '../workspace/try/sample-data.js';

const args = process.argv.slice(2);
const json = args.includes('--json');
const paths = args.filter((a) => a !== '--json');

if (paths.length === 0) {
  console.error('usage: node tools/check-invite.mjs [--json] <file|folder>…');
  process.exit(2);
}

const files = [];
let bad = 0;
for (const p of paths) {
  let st;
  try { st = statSync(p); } catch { console.error(`cannot read ${p}`); bad++; continue; }
  if (st.isDirectory()) {
    for (const f of readdirSync(p).filter((f) => /\.(md|txt)$/.test(f)).sort()) files.push(join(p, f));
  } else {
    files.push(p);
  }
}

let passed = 0;
let failed = 0;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const result = readInvite(text);
  if (json) {
    console.log(JSON.stringify({ file: basename(file), ...result }, null, 2));
    continue;
  }

  console.log(`── ${basename(file)}`);
  const expect = expectation(text);
  if (expect) console.log(`  expects: ${expect.comment}`);

  if (result.ok) {
    const { properties: p, pages, tasks, databases } = result.invite;
    console.log(`  read: name "${p.name}" · invite ${p.invite ?? 'none'} · platform ${p.platform} · role ${p.role} (laid out as ${p.layout}) · project "${p.project}"`);
    for (const k of ['ai_tools', 'knowledge_tools', 'files_live_in']) {
      console.log(`  ${k}: ${list(p[k].map((t) => (t.known ? t.id : `"${t.label}" (other)`)))}`);
    }
    console.log(`  pages (${pages.length}): ${list(pages.map((x) => `"${x.title}"`))}`);
    console.log(`  tasks.md: ${tasks.length} tasks, ${tasks.filter((t) => t.done).length} ticked`);
    for (const d of databases) console.log(`  database "${d.name}": columns ${list(d.columns)}; ${d.rows.length} rows`);
    if (!databases.length) console.log('  databases: none');
    for (const w of result.warnings) console.log(`  warning ${w.code}${w.name ? ` "${w.name}"` : ''}: ${w.message}`);
    if (!result.warnings.length) console.log('  warnings: none');
  } else {
    console.log(`  error ${result.error.code}: ${result.error.message}`);
    console.log(`  paste back: ${result.error.pasteBack}`);
  }

  if (expect) {
    const got = result.ok ? { error: null, warnings: result.warnings.map((w) => w.code).sort() } : { error: result.error.code, warnings: [] };
    const ok = got.error === expect.error && got.warnings.join() === expect.warnings.join();
    console.log(ok ? '  PASS' : `  FAIL: expected ${describe(expect)}, got ${describe(got)}`);
    if (ok) passed++;
    else failed++;
  }
}

let exampleFailed = false;
// The example data ships with the page (27 Oct 2026: fetched on a protected preview, it said the file couldn't be opened). Checked on every run:
// the page reads it from sample-data.js and fetches nothing for it; the shipped text is the fixture's, when the fixture is among the files checked; and it reads as the fixture says.
if (!json) {
  console.log('── the example data, shipped with the page (workspace/try/sample-data.js)');
  const problems = [];
  const tryJs = readFileSync(fileURLToPath(new URL('../workspace/try/try.js', import.meta.url)), 'utf8');
  if (!/from '\.\/sample-data\.js'/.test(tryJs)) problems.push('try.js does not import sample-data.js');
  if (/fetch\(/.test(tryJs)) problems.push('try.js fetches something; the example must load with no request');
  const fixture = files.find((f) => basename(f) === 'sample.md');
  if (fixture && readFileSync(fixture, 'utf8') !== SAMPLE_TEXT) problems.push('sample-data.js differs from fixtures/sample.md: run node tools/carry-sample.mjs');
  const r = readInvite(SAMPLE_TEXT);
  if (!r.ok) problems.push(`it does not read: ${r.error.code}`);
  else {
    const codes = r.warnings.map((w) => w.code).join();
    if (codes !== 'bad-invite') problems.push(`expected only bad-invite, got ${codes || 'no warnings'}`);
    if (r.invite.properties.name !== 'Sam' || r.invite.properties.layout !== 'both') problems.push('it is not Sam, laid out as both');
  }
  if (!fixture) console.log('  (fixtures/sample.md not among the files: shipped text not compared)');
  console.log(problems.length ? problems.map((p) => `  FAIL: ${p}`).join('\n') : '  PASS: imported, not fetched, the fixture\'s text, and reads as Sam with bad-invite only');
  exampleFailed = problems.length > 0;
}

if (!json) console.log(`\n${files.length} files: ${passed} pass, ${failed} fail, ${files.length - passed - failed} with no expectation; the example data: ${exampleFailed ? 'FAIL' : 'pass'}`);
process.exit(bad || failed || exampleFailed ? 1 : 0);

// The problem codes a test file's opening comment names.
function expectation(text) {
  const m = text.replace(/^﻿/, '').match(/^\s*<!--([\s\S]*?)-->/);
  if (!m) return null;
  const comment = m[1].trim();
  const named = Object.keys(PROBLEMS).filter((code) => new RegExp(`(^|[^\\w-])${code}([^\\w-]|$)`).test(comment));
  const errors = named.filter((c) => PROBLEMS[c].kind === 'error');
  return {
    comment: comment.replace(/^Fixture:\s*/, ''),
    error: errors[0] ?? null,
    warnings: errors.length ? [] : named.filter((c) => PROBLEMS[c].kind === 'warning').sort(),
  };
}

function describe(e) {
  return e.error ? `error ${e.error}` : `a demo with ${e.warnings.length ? `warnings ${e.warnings.join(', ')}` : 'no warnings'}`;
}

function list(xs) {
  return xs.length ? xs.join(', ') : 'none';
}
