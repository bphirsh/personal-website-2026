#!/usr/bin/env tsx
/**
 * import-signups — the one-time import of the earlier sign-ups into the Resend beta list (M-027, step 5 of row "Sign-ups join the beta list automatically").
 *
 *   tools/import-signups.sh              # dry run: list who would be added, change nothing
 *   tools/import-signups.sh --go         # add them, after Brian's go on that list
 *   tools/import-signups.sh --base <folder> …   # from another base
 *
 * Reads the Signups table (read only) for every row with an email, and adds each to the "Beta" segment with its name, platform and AI tools as the `computer` and `agents` properties, through api/_beta-list.js's joinBetaList, the same call the site makes, so someone already on the list is updated, not duplicated. **No confirmation email is sent** (Brian, 30 Oct 2026: no separate notice). Run with Brian's go; the dry-run output holds real names and emails, so it is for his terminal only. Key and segment as tools/sync-signups.mts reads them.
 */

import * as os from 'node:os'
import * as path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const { joinBetaList } = require('../api/_beta-list.js')

// Home-relative, so it runs under any account with the same ~/Syncthing layout (the Mac mini's is `assistant`).
const WORKSPACE = path.join(os.homedir(), 'Syncthing/Projects/Agentic Workspace')
const CODE = process.env.WORKSPACE_CODE || path.join(WORKSPACE, 'v0/code')
const DEFAULT_BASE = path.join(WORKSPACE, 'Marketing/Beta Signups/Signups')
const EMAIL_RE = /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/

export interface Planned { name: string; email: string; computer: string | null; agents: string[] }

/** Who would be added: every row with a plausible email, once per email. Exported for tools/check-sync-signups.mts. */
export function planImport(base: { db: { prepare(sql: string): { all(): unknown[] } } }): { add: Planned[]; skipped: string[] } {
  const rows = base.db.prepare("SELECT name, email, platform, ai_tools FROM signups WHERE email IS NOT NULL AND trim(email) != '' ORDER BY pos").all() as Array<{ name: string | null; email: string; platform: string | null; ai_tools: string | null }>
  const seen = new Set<string>()
  const add: Planned[] = []
  const skipped: string[] = []
  for (const r of rows) {
    const email = r.email.trim()
    if (!EMAIL_RE.test(email)) { skipped.push(`${email} (not an email)`); continue }
    if (seen.has(email.toLowerCase())) { skipped.push(`${email} (a second row)`); continue }
    seen.add(email.toLowerCase())
    let agents: string[] = []
    try { agents = r.ai_tools ? JSON.parse(r.ai_tools).map(String) : [] } catch { /* an unreadable cell is no agents */ }
    add.push({ name: (r.name ?? '').trim(), email, computer: r.platform || null, agents })
  }
  return { add, skipped }
}

async function main(): Promise<void> {
  const at = process.argv.indexOf('--base')
  const dir = path.resolve(at === -1 ? DEFAULT_BASE : process.argv[at + 1])
  const go = process.argv.includes('--go')

  const { Base, setAppDataRoot } = await import(pathToFileURL(path.join(CODE, 'src/shared/db.ts')).href)
  setAppDataRoot(path.join(os.homedir(), 'Library', 'Application Support', 'agentic-workspace'))
  const base = Base.open(dir)
  let plan: ReturnType<typeof planImport>
  try { plan = planImport(base) } finally { base.close() }

  console.log(`${go ? 'Adding' : 'Dry run: would add'} ${plan.add.length} to the Beta list, with no confirmation email:`)
  for (const p of plan.add) console.log(`  ${p.name || '(no name)'} <${p.email}>  ${p.computer ?? '-'}  ${p.agents.join(',') || '-'}`)
  for (const s of plan.skipped) console.log(`  skipped ${s}`)
  if (!go) { console.log('Nothing changed. Run again with --go to add them.'); return }

  const { apiKey, segmentId } = await import('./sync-signups.mts')
  const key = apiKey()
  const segment = await segmentId(key)
  let failed = 0
  for (const p of plan.add) {
    await new Promise((r) => setTimeout(r, 1500)) // up to four calls each, under Resend's rate limit
    const r = await joinBetaList({ apiKey: key, segmentId: segment, email: p.email, name: p.name, computer: p.computer, agents: p.agents })
    if (!r.ok) failed++
    console.log(`  ${r.ok ? 'ok' : 'FAILED'} ${p.email}: ${r.detail}`)
  }
  console.log(`${plan.add.length - failed} added or updated, ${failed} failed`)
  if (failed) process.exit(1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(`import-signups failed: ${err instanceof Error ? err.message : String(err)}`); process.exit(1) })
}
