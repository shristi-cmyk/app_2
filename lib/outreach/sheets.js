import { parseCsv } from './csv.js'

const list = (v) => {
  try { const a = JSON.parse(v); return Array.isArray(a) ? a.map((x) => (typeof x === 'string' ? x : x.name || x.trigger || '')).filter(Boolean) : [] } catch { return v ? [v] : [] }
}
const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v))

// The "TOTAL PUBLIC APPS" export names only a few columns, so fields are read by position.
// Positions were mapped from the sheet as exported in Oct 2026; re-check them if columns move.
const APP_COLUMNS = {
  rowId: 0, name: 8, slug: 10, category: 11, description: 14, domain: 15, tags: 18, authType: 21,
  actionNames: 23, triggerNames: 24, actionCount: 26, triggerCount: 27, email: 29, mailStatus: 30,
  stages: 31, contactName: 32, contactEmail: 33, contactRole: 34, notes: 37, apiDocs: 39,
  listingType: 41, listingStatus: 42, listingUrl: 43, blocker: 55, conversation: 68, team: 79
}

export function parseApps(text) {
  const rows = parseCsv(text)
  if (!rows.length) return []
  const header = rows[0].map((h) => h.trim().toLowerCase())
  if (!header.includes('appname') || header[0] !== 'rowid') {
    throw new Error('This does not look like the TOTAL PUBLIC APPS export (expected rowid … appname … domain headers).')
  }
  return rows.slice(1).filter((r) => r[APP_COLUMNS.name]).map((r) => {
    const get = (k) => (r[APP_COLUMNS[k]] ?? '').trim()
    return {
      id: get('rowId'),
      name: get('name'),
      slug: get('slug'),
      category: list(get('category')).join(', '),
      description: get('description'),
      domain: get('domain'),
      tags: list(get('tags')),
      authType: get('authType'),
      actions: list(get('actionNames')).slice(0, 15),
      triggers: list(get('triggerNames')).slice(0, 15),
      actionCount: num(get('actionCount')),
      triggerCount: num(get('triggerCount')),
      email: get('email') || get('contactEmail'),
      contactName: get('contactName'),
      contactRole: get('contactRole'),
      mailStatus: get('mailStatus'),
      stages: get('stages'),
      notes: get('notes'),
      apiDocs: get('apiDocs'),
      listing: [get('listingType'), get('listingStatus')].filter(Boolean).join(' / '),
      listingUrl: get('listingUrl'),
      blocker: get('blocker'),
      inConversation: get('conversation') === 'In conversation',
      team: get('team')
    }
  })
}

// "Shristi_Pipleline" tab: partner, Source / Team, Reachout Reason, Stage, Status, Last Activity, Next Follow Up, Notes, co-marketing, embed pitched, (link), month
export function parsePipeline(text) {
  const rows = parseCsv(text)
  if (!rows.length) return []
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const at = (name) => header.indexOf(name)
  if (at('partner') < 0) throw new Error('Expected a "partner" column in the pipeline sheet.')
  const col = {
    partner: at('partner'), team: at('source / team'), reason: at('reachout reason'), stage: at('stage'),
    status: at('status'), lastActivity: at('last activity'), nextFollowUp: at('next follow up'),
    notes: at('notes'), coMarketing: at('co-marketing'), embedPitched: at('embed pitched'), month: at('month')
  }
  return rows.slice(1).filter((r) => (r[col.partner] || '').trim()).map((r) => {
    const get = (k) => (col[k] >= 0 ? (r[col[k]] ?? '').trim() : '')
    const link = col.embedPitched >= 0 ? (r[col.embedPitched + 1] ?? '').trim() : ''
    return {
      partner: get('partner'),
      team: get('team'),
      reason: get('reason'),
      stage: get('stage'),
      status: get('status').toLowerCase(),
      lastActivity: get('lastActivity'),
      nextFollowUp: get('nextFollowUp'),
      notes: get('notes'),
      coMarketing: get('coMarketing'),
      embedPitched: get('embedPitched').toUpperCase() === 'TRUE',
      link: /^https?:/.test(link) ? link : '',
      month: get('month'),
      source: 'sheet'
    }
  })
}

export const normName = (s) => (s || '').toLowerCase().replace(/\.(com|io|ai|app|co)$/, '').replace(/[^a-z0-9]/g, '')
