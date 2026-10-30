#!/usr/bin/env tsx
/**
 * check-sync-signups — run the beta-list sync against a made-up base, so no real sign-up is read or written.
 *
 *   "$HOME/Syncthing/Projects/Agentic Workspace/v0/code/node_modules/.bin/tsx" tools/check-sync-signups.mts
 *
 * It makes a fresh base in a temporary folder with the Signups table's fields as Marketing/Beta Signups/Signups/README.md lists them (not a copy of the real file, which holds real people), adds one made-up person, and runs syncContacts from tools/sync-signups.mts twice with made-up contacts in place of Resend. Each case says PASS or FAIL; exit 1 on any FAIL. What it cannot see: Resend's own API, which a run with the real key shows.
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'
import { syncContacts, isExcluded, type Contact } from './sync-signups.mts'
import { planImport } from './import-signups.mts'

const CODE = process.env.WORKSPACE_CODE || path.join(os.homedir(), 'Syncthing/Projects/Agentic Workspace/v0/code')
const { Base, setAppDataRoot } = await import(pathToFileURL(path.join(CODE, 'src/shared/db.ts')).href)

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'check-sync-signups-'))
setAppDataRoot(path.join(tmp, 'appdata'))
const dir = path.join(tmp, 'Signups')
const base = Base.open(dir, { create: true })

// The fields from Signups/README.md, 30 Oct 2026.
base.createTable('signups', 'Signups', [
  { name: 'name', label: 'Name', type: 'text' },
  { name: 'number', label: 'Number', type: 'number' },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'phone', label: 'Phone', type: 'phone' },
  { name: 'met_at', label: 'Met at', type: 'select', options: { options: ['21 Oct talk'] } },
  { name: 'invite', label: 'Invite code', type: 'text' },
  { name: 'status', label: 'Status', type: 'select', options: { options: ['Not invited', 'Invited', 'Replied', 'Wants the build', 'Windows list', 'Not a fit', 'No reply'] } },
  { name: 'platform', label: 'Platform', type: 'select', options: { options: ['mac-apple-silicon', 'mac-intel', 'mac', 'windows', 'linux', 'other'] } },
  { name: 'role', label: 'Role', type: 'select', options: { options: ['coder', 'knowledge-worker', 'both'] } },
  { name: 'ai_tools', label: 'AI tools', type: 'multi_select', options: { options: ['claude', 'claude-code', 'chatgpt', 'codex', 'gemini', 'cursor', 'copilot', 'windsurf', 'perplexity', 'ollama'] } },
  { name: 'knowledge_tools', label: 'Knowledge tools', type: 'multi_select', options: { options: ['obsidian', 'notion'] } },
  { name: 'notes', label: 'Notes', type: 'text' },
  { name: 'signed_up', label: 'Signed up', type: 'date' },
], 'signups')

// One person already in the base, as from the 21 Oct talk, made up.
const morgan = base.insertRow('signups', { name: 'Morgan Example', email: 'Morgan@Example.test', met_at: '21 Oct talk', status: 'Invited', platform: 'mac-intel' }, { actor: 'check' })

const contacts: Contact[] = [
  { email: 'sam@example.test', first_name: 'Sam', last_name: 'Q. Test', created_at: '2026-10-30T18:00:00.000Z', computer: 'mac-apple-silicon', agents: ['claude', 'grok'] },
  { email: 'morgan@example.test', first_name: 'Morgan', computer: 'mac-apple-silicon', agents: ['cursor'] },
  { email: 'riley@example.test', computer: null, agents: [] },
]

const rows = () => base.db.prepare('SELECT * FROM signups ORDER BY pos').all() as Array<Record<string, unknown>>
const opts = (f: string) => JSON.parse((base.db.prepare("SELECT options FROM _fields WHERE tbl='signups' AND name=?").get(f) as { options: string }).options).options as string[]

const dry = syncContacts(base, contacts, { dryRun: true })
const afterDry = rows().length
const first = syncContacts(base, contacts)
const afterFirst = rows()
const second = syncContacts(base, contacts)
const afterSecond = rows()
const sam = afterFirst.find((r) => r.email === 'sam@example.test')!
const m = afterFirst.find((r) => r.id === morgan)!
const authors = base.db.prepare("SELECT DISTINCT actor FROM _changes WHERE seq > 0 AND actor IS NOT NULL").all().map((r: { actor: string }) => r.actor)

const cases: Array<[string, boolean]> = [
  ['a dry run writes nothing but says what it would', afterDry === 1 && dry.added.length === 2 && dry.updated.length === 1],
  ['the first run adds the two new people', first.added.join() === 'sam@example.test,riley@example.test' && afterFirst.length === 3],
  ['the new person has name, OS, agents, date, status', sam.name === 'Sam Q. Test' && sam.platform === 'mac-apple-silicon' && sam.ai_tools === '["claude","grok"]' && sam.signed_up === '2026-10-30' && sam.status === 'Not invited'],
  ['the known person matched on email, any case: OS and agents updated, name and status kept', first.updated.length === 1 && m.platform === 'mac-apple-silicon' && m.ai_tools === '["cursor"]' && m.name === 'Morgan Example' && m.status === 'Invited'],
  ['a missing option (grok) was added to the field first', opts('ai_tools').includes('grok') && first.optionsAdded.join() === 'ai_tools: grok'],
  ['the second run adds and changes nothing', second.added.length === 0 && second.updated.length === 0 && afterSecond.length === 3 && JSON.stringify(afterSecond) === JSON.stringify(afterFirst)],
  ['every change is stamped sync-signups (or check, for the setup)', authors.includes('sync-signups') && authors.every((a: string) => a === 'sync-signups' || a === 'check')],
  ['nothing is deleted when someone leaves the list', syncContacts(base, []).added.length === 0 && rows().length === 3],
]

// The one-time import's plan, from the same made-up base plus a duplicate and a phone-only row.
base.insertRow('signups', { name: 'Morgan Again', email: 'morgan@example.test' }, { actor: 'check' })
base.insertRow('signups', { name: 'Phone Only', phone: '+1 555 000 0000' }, { actor: 'check' })
base.insertRow('signups', { name: 'Typo', email: 'typo@example' }, { actor: 'check' })
const plan = planImport(base)
cases.push(
  ['the import plans each email once, with OS and agents', plan.add.map((p) => p.email).join() === 'Morgan@Example.test,sam@example.test,riley@example.test' && plan.add[1].computer === 'mac-apple-silicon' && plan.add[1].agents.join() === 'claude,grok'],
  ['it skips the repeat and the non-email, and leaves the phone-only row out', plan.skipped.length === 2 && plan.skipped.some((s) => s.includes('second row')) && plan.skipped.some((s) => s.includes('not an email'))],
)

// Brian's own and test addresses (row "The Signups sync skips Brian's and test addresses").
const mine: Contact[] = [
  { email: '2brianhirsh@gmail.com', first_name: 'Brian', computer: 'mac-apple-silicon', agents: ['claude'] },
  { email: '2BrianHirsh+beta-test@Gmail.com', computer: 'mac-apple-silicon', agents: [] },
  { email: 'delivered@resend.dev', computer: 'windows', agents: ['muse'] },
  { email: 'Bounced@RESEND.DEV', computer: null, agents: [] },
]
const nearMisses = ['2brianhirsh2@gmail.com', 'x@resend.dev.example', 'a2brianhirsh@gmail.com', '2brianhirsh@gmail.com.example', 'x@notresend.dev']
const before = rows().length
const skip = syncContacts(base, [...mine, { email: 'jordan@example.test', computer: 'linux', agents: [] }])
const mineIn = rows().filter((r) => isExcluded(String(r.email ?? '')))
cases.push(
  ['2brianhirsh@gmail.com, any case, is skipped', isExcluded('2brianhirsh@gmail.com') && isExcluded(' 2BrianHirsh@GMAIL.com ')],
  ['2brianhirsh+anything@gmail.com is skipped', isExcluded('2brianhirsh+beta@gmail.com') && isExcluded('2brianhirsh+@gmail.com') && isExcluded('2BrianHirsh+A.b-1@Gmail.com')],
  ['any address at resend.dev is skipped', isExcluded('delivered@resend.dev') && isExcluded('Bounced@RESEND.DEV')],
  ['near misses are not skipped', nearMisses.every((e) => !isExcluded(e))],
  ['the sync leaves them out, adds the rest, and only counts them', skip.skipped === 4 && skip.added.join() === 'jordan@example.test' && rows().length === before + 1 && mineIn.length === 0],
  ['an excluded contact adds no option (windows is there; muse is not added)', !opts('ai_tools').includes('muse')],
)
base.insertRow('signups', { name: 'Brian', email: '2BrianHirsh+old@gmail.com' }, { actor: 'check' })
base.insertRow('signups', { name: 'Test', email: 'delivered@resend.dev' }, { actor: 'check' })
const plan2 = planImport(base)
cases.push(['the import leaves them out too, counted, not listed', plan2.excluded === 2 && !plan2.add.some((p) => isExcluded(p.email)) && !plan2.skipped.some((s) => /brianhirsh|resend\.dev/i.test(s)) && plan2.add.some((p) => p.email === 'jordan@example.test')])

let failed = 0
for (const [name, ok] of cases) {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
}
base.close()
fs.rmSync(tmp, { recursive: true, force: true })
console.log(`${cases.length - failed} pass, ${failed} fail`)
process.exit(failed ? 1 : 0)
