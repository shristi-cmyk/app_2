import fs from 'node:fs'
import path from 'node:path'

// EOD data in one JSON file beside the other tools' files. Logged entries themselves live in the Google
// Sheet (the source of truth); this file keeps statuses, the roster, settings, connections, idempotency
// records and the audit trail. Holds auth_ids and script_ids, so it stays on the server (data/ is ignored).
const dir = process.env.DATA_DIR || './data'
const file = path.join(dir, 'eod.json')

export const DEFAULT_SETTINGS = {
  timezone: 'Asia/Kolkata',
  workingDays: [1, 2, 3, 4, 5], // Mon-Fri
  reminderCron: '0 19 * * 1-5',
  appUrl: '',
  sheet: {
    spreadsheetId: '', spreadsheetLabel: '', sheetId: '', sheetLabel: '',
    // Header names in the sheet's first row, per field. "Entry ID" makes writes idempotent and rows traceable.
    columns: { entryId: 'Entry ID', date: 'Date', employee: 'Employee', done: 'Done', blockers: 'Blockers', plan: 'Plan', submittedAt: 'Submitted At' }
  },
  slack: { eodChannelId: '', eodChannelLabel: '', tlTargetType: 'channel', tlTargetId: '', tlTargetLabel: '' }
}

const EMPTY = () => ({
  settings: structuredClone(DEFAULT_SETTINGS),
  connections: {},
  members: {},
  entries: {},
  flows: {},
  deliveries: {},
  reminders: {},
  queries: {},
  audit: []
})

function load() {
  try {
    const d = JSON.parse(fs.readFileSync(file, 'utf8'))
    const base = EMPTY()
    return {
      ...base,
      ...d,
      settings: {
        ...base.settings,
        ...(d.settings || {}),
        sheet: { ...base.settings.sheet, ...(d.settings?.sheet || {}), columns: { ...base.settings.sheet.columns, ...(d.settings?.sheet?.columns || {}) } },
        slack: { ...base.settings.slack, ...(d.settings?.slack || {}) }
      }
    }
  } catch {
    return EMPTY()
  }
}

const g = globalThis
export function db() {
  if (!g.__eodDb) g.__eodDb = load()
  return g.__eodDb
}

export function save() {
  fs.mkdirSync(dir, { recursive: true })
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(g.__eodDb), { mode: 0o600 })
  fs.renameSync(tmp, file)
}

export function change(fn) {
  const d = db()
  const out = fn(d)
  save()
  return out
}

const AUDIT_CAP = 5000

// Every logged entry, edit, status change and TL query. Details never carry tokens or ids that are credentials.
export function audit(actor, action, details = {}) {
  change((d) => {
    d.audit.push({ at: new Date().toISOString(), actor: actor ? { id: actor.id, name: actor.name, role: actor.role } : { id: 'system' }, action, ...details })
    if (d.audit.length > AUDIT_CAP) d.audit.splice(0, d.audit.length - AUDIT_CAP)
  })
}

// Serialises async work per key (one entry, one reminder), so a double click or a retried request
// cannot run the same write twice at once.
const locks = g.__eodLocks || (g.__eodLocks = new Map())
export function withLock(key, fn) {
  const tail = locks.get(key) || Promise.resolve()
  const run = tail.then(() => fn())
  const settled = run.catch(() => {})
  locks.set(key, settled)
  settled.then(() => { if (locks.get(key) === settled) locks.delete(key) })
  return run
}
