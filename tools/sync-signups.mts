#!/usr/bin/env tsx
/**
 * sync-signups — copy the Resend beta list into Brian's Signups database (M-027, row "Sign-ups join the beta list automatically").
 *
 *   tools/sync-signups.sh                      # into Marketing/Beta Signups/Signups
 *   tools/sync-signups.sh --base <folder>      # into another base, such as a test copy
 *   tools/sync-signups.sh --dry-run            # say what would change, write nothing
 *
 * Reads every contact in the "Beta" segment through Resend's API, with its `computer` and `agents` properties (api/_beta-list.js writes them), and writes the Signups table through the Workspace engine (Base.open, insertRow, setCell, updateField), with every change stamped as the actor "sync-signups". It matches people on email, case-insensitively: a new email becomes a new row; a known one has its platform and AI tools brought up to date when they changed, and its name filled only when the row has none. It never deletes a row and never writes the same person twice. A select option the base doesn't have yet (grok, muse, a tool typed on the try page) is added to the field first, so no value lands outside its options.
 *
 * The Resend key comes from RESEND_API_KEY, or else from the login Keychain of the account it runs under (`security add-generic-password -s resend-beta-sync -a "$USER" -w`, typed by him; the key is never in a file). The segment is the one named "Beta", or RESEND_AUDIENCE_ID when set. Resend allows a few requests a second, so calls are spaced.
 *
 * tools/ is excluded from deploy by .vercelignore. The engine is imported from the Agentic Workspace code (WORKSPACE_CODE overrides where), so this runs with that project's tsx; tools/sync-signups.sh says how.
 */

import { execFileSync } from 'node:child_process'
import * as os from 'node:os'
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'

// Home-relative, so it runs under any account with the same ~/Syncthing layout (the Mac mini's is `assistant`).
const WORKSPACE = path.join(os.homedir(), 'Syncthing/Projects/Agentic Workspace')
const CODE = process.env.WORKSPACE_CODE || path.join(WORKSPACE, 'v0/code')
const DEFAULT_BASE = path.join(WORKSPACE, 'Marketing/Beta Signups/Signups')
const TABLE = 'signups'
const ACTOR = 'sync-signups'
const RESEND = 'https://api.resend.com'
const SPACING_MS = 600

/** A beta-list contact as the sync needs it. */
export interface Contact {
  email: string
  first_name?: string | null
  last_name?: string | null
  created_at?: string | null
  computer?: string | null
  agents: string[]
}

/** What one sync did, by email. */
export interface SyncResult {
  added: string[]
  updated: string[]
  unchanged: string[]
  optionsAdded: string[]
}

/** The engine's Base, as far as this script uses it. */
interface BaseLike {
  db: { prepare(sql: string): { all(...a: unknown[]): unknown[]; get(...a: unknown[]): unknown } }
  insertRow(tbl: string, values: Record<string, unknown>, opts: { actor?: string }): string
  setCell(tbl: string, id: string, col: string, value: unknown, opts: { actor?: string }): number
  updateField(tbl: string, name: string, patch: { options?: Record<string, unknown> }): void
  write<T>(fn: () => T, actor?: string): T
}

const sameList = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i])

function decodeList(v: unknown): string[] {
  if (typeof v !== 'string' || !v) return []
  try {
    const out = JSON.parse(v)
    return Array.isArray(out) ? out.map(String) : []
  } catch {
    return []
  }
}

/** The field's options, read from the base (reading `_fields` is fine; writing it goes through updateField). */
function optionsOf(base: BaseLike, field: string): string[] {
  const row = base.db.prepare('SELECT options FROM _fields WHERE tbl = ? AND name = ?').get(TABLE, field) as { options: string | null } | undefined
  if (!row) throw new Error(`the ${TABLE} table has no ${field} field`)
  const opts = row.options ? JSON.parse(row.options) : {}
  return Array.isArray(opts.options) ? opts.options.map(String) : []
}

/** Add any of `values` the field doesn't offer yet, through the engine, keeping the rest of its options as they are. */
function ensureOptions(base: BaseLike, field: string, values: readonly string[], dryRun: boolean): string[] {
  const have = optionsOf(base, field)
  const missing = [...new Set(values)].filter((v) => v && !have.includes(v))
  if (missing.length && !dryRun) {
    const row = base.db.prepare('SELECT options FROM _fields WHERE tbl = ? AND name = ?').get(TABLE, field) as { options: string | null }
    const opts = row.options ? JSON.parse(row.options) : {}
    base.write(() => base.updateField(TABLE, field, { options: { ...opts, options: [...have, ...missing] } }), ACTOR)
  }
  return missing.map((m) => `${field}: ${m}`)
}

/** Write `contacts` into the Signups table of `base`. Exported so tools/check-sync-signups.mts can run it against a made-up base. */
export function syncContacts(base: BaseLike, contacts: readonly Contact[], opts: { dryRun?: boolean } = {}): SyncResult {
  const dryRun = opts.dryRun === true
  const result: SyncResult = { added: [], updated: [], unchanged: [], optionsAdded: [] }

  // Options first, so every value written below is one the field offers.
  result.optionsAdded.push(...ensureOptions(base, 'platform', contacts.map((c) => c.computer ?? '').filter(Boolean), dryRun))
  result.optionsAdded.push(...ensureOptions(base, 'ai_tools', contacts.flatMap((c) => c.agents), dryRun))

  const rows = base.db.prepare(`SELECT id, name, email, platform, ai_tools FROM "${TABLE}" WHERE email IS NOT NULL AND email != ''`).all() as Array<{
    id: string; name: string | null; email: string; platform: string | null; ai_tools: string | null
  }>
  const byEmail = new Map(rows.map((r) => [r.email.trim().toLowerCase(), r]))

  for (const c of contacts) {
    const key = c.email.trim().toLowerCase()
    const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim()
    const row = byEmail.get(key)

    if (!row) {
      if (!dryRun) {
        const values: Record<string, unknown> = {
          email: c.email.trim(),
          status: 'Not invited',
          ai_tools: c.agents,
          notes: 'From the Resend beta list, by sync-signups.',
        }
        if (name) values.name = name
        if (c.computer) values.platform = c.computer
        if (c.created_at) values.signed_up = c.created_at.slice(0, 10)
        const id = base.insertRow(TABLE, values, { actor: ACTOR })
        // A second contact with the same email (different case) in one run is the same person.
        byEmail.set(key, { id, name: name || null, email: c.email, platform: c.computer ?? null, ai_tools: JSON.stringify(c.agents) })
      } else {
        byEmail.set(key, { id: '(dry run)', name: name || null, email: c.email, platform: c.computer ?? null, ai_tools: JSON.stringify(c.agents) })
      }
      result.added.push(c.email)
      continue
    }

    // A known person: bring the OS and agents up to date when Resend says something different. Nothing said is not a change, so an empty value never wipes one.
    const changes: Record<string, unknown> = {}
    if (c.computer && c.computer !== row.platform) changes.platform = c.computer
    if (c.agents.length && !sameList(c.agents, decodeList(row.ai_tools))) changes.ai_tools = c.agents
    if (name && !row.name) changes.name = name
    if (!Object.keys(changes).length) {
      result.unchanged.push(c.email)
      continue
    }
    if (!dryRun) for (const [col, v] of Object.entries(changes)) base.setCell(TABLE, row.id, col, v, { actor: ACTOR })
    result.updated.push(`${c.email} (${Object.keys(changes).join(', ')})`)
  }
  return result
}

// ---- Resend ------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function resend<T>(key: string, p: string): Promise<T> {
  await sleep(SPACING_MS)
  const res = await fetch(RESEND + p, { headers: { Authorization: `Bearer ${key}` } })
  if (!res.ok) throw new Error(`Resend ${p}: ${res.status} ${(await res.text()).slice(0, 200)}`)
  return (await res.json()) as T
}

export function apiKey(): string {
  if (process.env.RESEND_API_KEY) return process.env.RESEND_API_KEY
  try {
    return execFileSync('security', ['find-generic-password', '-s', 'resend-beta-sync', '-w'], { encoding: 'utf8' }).trim()
  } catch {
    throw new Error('no Resend key: set RESEND_API_KEY, or add it to the login Keychain as the service "resend-beta-sync" (tools/sync-signups.sh says how)')
  }
}

export async function segmentId(key: string): Promise<string> {
  if (process.env.RESEND_AUDIENCE_ID) return process.env.RESEND_AUDIENCE_ID
  const list = await resend<{ data: Array<{ id: string; name: string }> }>(key, '/segments')
  const beta = list.data.filter((s) => s.name === 'Beta')
  if (beta.length !== 1) throw new Error(`expected one segment named "Beta", found ${beta.length}`)
  return beta[0].id
}

/** Every contact in the segment, each read once more for its properties (the list leaves them out). */
export async function fetchContacts(key: string, segment: string): Promise<Contact[]> {
  const out: Contact[] = []
  let after: string | null = null
  for (;;) {
    const page: { data: Array<{ id: string }>; has_more: boolean } = await resend(key, `/contacts?segment_id=${encodeURIComponent(segment)}&limit=100${after ? `&after=${after}` : ''}`)
    for (const { id } of page.data) {
      const c = await resend<{ email: string; first_name?: string; last_name?: string; created_at?: string; properties?: Record<string, { value?: unknown }> }>(key, `/contacts/${id}`)
      const prop = (k: string): string => String(c.properties?.[k]?.value ?? '').trim()
      out.push({
        email: c.email,
        first_name: c.first_name ?? null,
        last_name: c.last_name ?? null,
        created_at: c.created_at ?? null,
        computer: prop('computer') || null,
        agents: prop('agents').split(',').map((a) => a.trim()).filter(Boolean),
      })
    }
    if (!page.has_more || !page.data.length) break
    after = page.data[page.data.length - 1].id
  }
  return out
}

// ---- main --------------------------------------------------------------------

async function main(): Promise<void> {
  const arg = (flag: string): string | undefined => {
    const at = process.argv.indexOf(flag)
    return at === -1 ? undefined : process.argv[at + 1]
  }
  const dryRun = process.argv.includes('--dry-run')
  const dir = path.resolve(arg('--base') ?? DEFAULT_BASE)
  const stamp = () => new Date().toISOString()

  const key = apiKey()
  const segment = await segmentId(key)
  const contacts = await fetchContacts(key, segment)

  const { Base, setAppDataRoot } = await import(pathToFileURL(path.join(CODE, 'src/shared/db.ts')).href)
  setAppDataRoot(path.join(os.homedir(), 'Library', 'Application Support', 'agentic-workspace'))
  const base = Base.open(dir)
  try {
    const r = syncContacts(base, contacts, { dryRun })
    console.log(`${stamp()} sync-signups${dryRun ? ' (dry run, nothing written)' : ''}: ${contacts.length} on the beta list; ${r.added.length} added, ${r.updated.length} updated, ${r.unchanged.length} unchanged, into ${dir}`)
    for (const e of r.added) console.log(`  added ${e}`)
    for (const e of r.updated) console.log(`  updated ${e}`)
    for (const o of r.optionsAdded) console.log(`  new option ${o}`)
  } finally {
    base.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`${new Date().toISOString()} sync-signups failed: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  })
}
