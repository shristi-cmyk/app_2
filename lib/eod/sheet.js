import { IDS } from './config.js'
import { db } from './db.js'
import { runAction, connection, ActionError } from './vs.js'

// The Google Sheet is the single source of truth for logged entries. Every read pages through the
// whole sheet (it grows every day); every write is one appended row with a unique Entry ID.

const EMPTY_SHEET = 'The selected sheet is empty.'
const PAGE = 500
const MAX_PAGES = 200

export function sheetConfig() {
  const s = db().settings.sheet
  if (!s.spreadsheetId || !s.sheetId) throw new ActionError('The EOD sheet is not configured. An admin picks it in Settings.')
  for (const k of ['entryId', 'date', 'employee', 'done', 'blockers', 'plan', 'submittedAt']) {
    if (!s.columns[k]) throw new ActionError(`The sheet column for "${k}" is not set in Settings.`)
  }
  return s
}

// Lists are stored one item per line, so the sheet stays readable for people.
export const listToCell = (items) => items.map((x) => `• ${x}`).join('\n')
export const cellToList = (cell) => String(cell ?? '').split(/\n+/).map((x) => x.replace(/^[\s•\-*]+/, '').trim()).filter(Boolean)

// Header names are matched loosely (case, spaces and punctuation), as the Add Multiple Rows action does.
const looseKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
function cellFor(row, header) {
  if (header in row) return row[header]
  const want = looseKey(header)
  const key = Object.keys(row).find((k) => looseKey(k) === want)
  return key ? row[key] : ''
}

export function rowToEntry(row, columns, sheetId) {
  const get = (k) => {
    const v = cellFor(row, columns[k])
    return v === null || v === undefined ? '' : String(v).trim()
  }
  return {
    rowNumber: row._rowNumber,
    sheetRowId: `${sheetId}:${row._rowNumber}`,
    entryId: get('entryId'),
    date: get('date'),
    employee: get('employee'),
    done: cellToList(get('done')),
    blockers: cellToList(get('blockers')),
    plan: cellToList(get('plan')),
    submittedAt: get('submittedAt')
  }
}

async function listPage(s, sorting) {
  const { scriptId } = connection('sheets')
  const payload = await runAction(scriptId, IDS.sheetsListRows, {
    spreadSheet_id: s.spreadsheetId,
    sheet_id: s.sheetId,
    column_key: true,
    sorting_limit: sorting
  }, { allow: [EMPTY_SHEET], raw: true })
  if (payload.success === false) return { rows: [], next: null } // empty sheet
  return { rows: Array.isArray(payload.data) ? payload.data : [], next: payload.offset ?? null }
}

// Every row, page by page. Rows with no date and no content (blank lines) are skipped.
export async function readAllEntries() {
  const s = sheetConfig()
  const out = []
  let offset = 0
  for (let page = 0; page < MAX_PAGES; page++) {
    const { rows, next } = await listPage(s, { row_count: PAGE, is_last_row: false, offset_row: offset })
    for (const r of rows) {
      const e = rowToEntry(r, s.columns, s.sheetId)
      if (e.date || e.done.length || e.entryId) out.push(e)
    }
    if (!next || !rows.length) break
    offset = next
  }
  return out
}

// The most recent rows, newest first: enough to spot an entry this app just wrote.
export async function readRecentEntries(count = 100) {
  const s = sheetConfig()
  const { rows } = await listPage(s, { row_count: count, is_last_row: true })
  return rows.map((r) => rowToEntry(r, s.columns, s.sheetId))
}

export async function findByEntryId(entryId) {
  return (await readRecentEntries(200)).find((e) => e.entryId === entryId) || null
}

// "Sheet1!A7:G7" -> 7
export const rowFromRange = (range) => {
  const m = /![A-Z]+(\d+)/.exec(range || '')
  return m ? Number(m[1]) : null
}

export async function appendEntry(entry, member) {
  const s = sheetConfig()
  const c = s.columns
  const { scriptId } = connection('sheets')
  const row = {
    [c.entryId]: entry.id,
    [c.date]: entry.date,
    [c.employee]: member.name,
    [c.done]: listToCell(entry.fields.done),
    [c.blockers]: listToCell(entry.fields.blockers),
    [c.plan]: listToCell(entry.fields.plan),
    [c.submittedAt]: entry.submittedAt
  }
  const result = await runAction(scriptId, IDS.sheetsAddRows, {
    spreadSheet_Id: s.spreadsheetId,
    sheet_id: s.sheetId,
    use_json_rows: true,
    rows_json: JSON.stringify([row])
  })
  const rowNumber = rowFromRange(result?.updates?.updatedRange)
  return { rowNumber, sheetRowId: rowNumber ? `${s.sheetId}:${rowNumber}` : null }
}

// Headers of the configured tab, from its first data row (for the column mapping in Settings).
export async function readHeaders(spreadsheetId, sheetId) {
  const { scriptId } = connection('sheets')
  const payload = await runAction(scriptId, IDS.sheetsListRows, {
    spreadSheet_id: spreadsheetId, sheet_id: sheetId, column_key: true,
    sorting_limit: { row_count: 1, is_last_row: false, offset_row: 0 }
  }, { allow: [EMPTY_SHEET], raw: true })
  const first = Array.isArray(payload.data) ? payload.data[0] : null
  return first ? Object.keys(first).filter((k) => k !== '_rowNumber') : []
}
