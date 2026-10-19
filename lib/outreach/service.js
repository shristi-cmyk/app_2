import { db, change, save } from './db.js'
import { ruleVerdict, pipelineFor, NONE_REASONS } from './rules.js'
import { parseApps, parsePipeline, letterRowsToArrays } from './sheets.js'
import { judge, revise } from './ai.js'
import { IDS, runAction } from '../viasocket.js'
import { readState } from '../store.js'

// status: new → judged (none) | review (sdk/gtm draft waiting) → sent | send_failed; dismissed by the owner.
export function importApps(apps) {
  return change((d) => {
    let added = 0
    for (const a of apps) {
      const prev = d.apps[a.id]
      if (!prev) added++
      // Keep our own work (verdict, draft, status) when the sheet is re-imported.
      d.apps[a.id] = prev ? { ...prev, ...a, work: prev.work } : { ...a, work: { status: 'new' } }
    }
    return { added, total: Object.keys(d.apps).length }
  })
}

export function importPipeline(rows) {
  return change((d) => {
    d.pipeline = [...rows, ...d.pipeline.filter((p) => p.source === 'app')]
    return { total: d.pipeline.length }
  })
}

function applyRules(d) {
  const seen = new Map()
  for (const a of Object.values(d.apps)) {
    const dom = (a.domain || '').toLowerCase().replace(/^www\./, '')
    if (dom && !seen.has(dom)) seen.set(dom, a.id)
  }
  for (const a of Object.values(d.apps)) {
    if (a.work.status !== 'new' || a.work.hint) continue
    const code = ruleVerdict(a, d.pipeline, seen)
    if (code) a.work = { status: 'judged', verdict: 'none', noneReason: code, reason: NONE_REASONS[code], by: 'rule', at: new Date().toISOString() }
  }
}

const LIST_ROWS = 'rowyu1mevdtq' // Google Sheets: List Rows in Sheet (action_version_id)

// Reads a whole tab through the owner's Google Sheets connection and imports it.
export async function importFromSheet(kind, { spreadsheetId, sheetId, label }) {
  const sheets = readState().scripts?.sheets
  if (!sheets) throw new Error('Connect Google Sheets first')
  const rows = await runAction(sheets, LIST_ROWS, {
    spreadSheet_id: spreadsheetId, sheet_id: sheetId, column_key: false,
    sorting_limit: { row_count: 0, is_last_row: false, offset_row: 0 }
  })
  if (!Array.isArray(rows)) throw new Error('Google Sheets returned no rows')
  const arrays = letterRowsToArrays(rows)
  const result = kind === 'apps' ? importApps(parseApps(arrays)) : importPipeline(parsePipeline(arrays))
  change((d) => { d.sources[kind] = { spreadsheetId, sheetId, label, importedAt: new Date().toISOString(), rows: rows.length } })
  return result
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Judges up to `limit` apps still marked new, a few at a time, in this server process.
export function startJudging(limit) {
  const d = db()
  if (d.job?.running) return d.job
  applyRules(d)
  const queue = Object.values(d.apps).filter((a) => a.work.status === 'new').slice(0, limit)
  d.job = { running: true, total: queue.length, done: 0, failed: 0, startedAt: new Date().toISOString(), lastError: '' }
  save()
  const worker = async () => {
    while (queue.length && d.job.running) {
      const app = queue.shift()
      try {
        const out = await judge(app, pipelineFor(app, d.pipeline), d.settings)
        app.work = {
          status: out.verdict === 'none' ? 'judged' : 'review',
          verdict: out.verdict, confidence: out.confidence, reason: out.reason,
          noneReason: out.noneReason, subject: out.subject, body: out.body, to: app.email,
          by: 'ai', at: new Date().toISOString()
        }
        d.job.done++
      } catch (e) {
        d.job.failed++
        d.job.lastError = `${app.name}: ${e.message}`
        if (e.status === 429) await sleep(20000)
      }
      save()
    }
  }
  Promise.all([worker(), worker(), worker(), worker()]).finally(() => { d.job.running = false; d.job.finishedAt = new Date().toISOString(); save() })
  return d.job
}

export function stopJudging() {
  return change((d) => { if (d.job) d.job.running = false; return d.job })
}

export async function requestChanges(id, instruction) {
  const d = db()
  const app = d.apps[id]
  if (!app?.work.subject) throw new Error('No draft for this app')
  const out = await revise(app, pipelineFor(app, d.pipeline), app.work, instruction, d.settings)
  return change(() => {
    app.work.revisions = [...(app.work.revisions || []), { instruction, subject: app.work.subject, body: app.work.body, at: new Date().toISOString() }]
    app.work.subject = out.subject
    app.work.body = out.body
    return app
  })
}

const html = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
const day = (offset = 0) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10)

export async function sendDraft(id) {
  const d = db()
  const app = d.apps[id]
  const w = app?.work
  if (!w || w.status !== 'review') throw new Error('This app has no draft waiting for review')
  if (!w.to) throw new Error('Add a recipient email first')
  const gmail = readState().scripts?.gmail
  if (!gmail) throw new Error('Connect Gmail in Setup first')
  try {
    await runAction(gmail, IDS.gmailSend, { to: w.to, subject: w.subject, messageBody: html(w.body), ...(d.settings.senderName ? { fromName: d.settings.senderName } : {}) })
  } catch (e) {
    change(() => { w.lastSendError = e.message })
    throw e
  }
  return change((db) => {
    w.status = 'sent'
    w.sentAt = new Date().toISOString()
    w.lastSendError = undefined
    db.pipeline.push({
      partner: app.name, appId: id, team: db.settings.team, reason: w.verdict === 'sdk' ? 'sdk / embed' : 'gtm / co-marketing',
      stage: 'Introductory', status: 'mail sent', lastActivity: day(), nextFollowUp: day(4), notes: w.subject,
      coMarketing: '', embedPitched: w.verdict === 'sdk', link: '', month: new Date().toLocaleString('en', { month: 'short' }), source: 'app'
    })
    return app
  })
}

export function updateWork(id, patch) {
  return change((d) => {
    const app = d.apps[id]
    if (!app) throw new Error('Unknown app')
    const w = app.work
    if (patch.action === 'dismiss') w.status = 'dismissed'
    if (patch.action === 'reset') app.work = { status: 'new' }
    if (patch.action === 'edit') Object.assign(w, pick(patch, ['subject', 'body', 'to']))
    // Owner overrides the verdict: a pitch needs a draft, so it goes back to the queue to be judged and drafted.
    if (patch.action === 'override') {
      if (patch.verdict === 'none') app.work = { ...w, status: 'judged', verdict: 'none', noneReason: patch.noneReason || 'other', reason: patch.reason || 'Marked by you', by: 'you' }
      else app.work = { status: 'new', hint: patch.verdict }
    }
    return app
  })
}

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]))

export function updatePipeline(index, patch) {
  return change((d) => {
    const row = d.pipeline[index]
    if (!row) throw new Error('Unknown pipeline row')
    Object.assign(row, pick(patch, ['stage', 'status', 'nextFollowUp', 'notes', 'lastActivity']))
    return row
  })
}

export function dashboard() {
  const d = db()
  const apps = Object.values(d.apps)
  const count = (f) => apps.filter(f).length
  const reasons = {}
  for (const a of apps) if (a.work.verdict === 'none' && a.work.status === 'judged') reasons[a.work.noneReason || 'other'] = (reasons[a.work.noneReason || 'other'] || 0) + 1
  const pipeline = {}
  for (const p of d.pipeline) pipeline[p.status || 'unknown'] = (pipeline[p.status || 'unknown'] || 0) + 1
  const today = day()
  return {
    total: apps.length,
    pending: count((a) => a.work.status === 'new'),
    sdk: count((a) => a.work.verdict === 'sdk'),
    gtm: count((a) => a.work.verdict === 'gtm'),
    none: count((a) => a.work.verdict === 'none' && a.work.status === 'judged'),
    noneReasons: Object.entries(reasons).map(([code, n]) => ({ code, label: NONE_REASONS[code] || code, n })).sort((a, b) => b.n - a.n),
    review: { sdk: count((a) => a.work.status === 'review' && a.work.verdict === 'sdk'), gtm: count((a) => a.work.status === 'review' && a.work.verdict === 'gtm') },
    sent: { sdk: count((a) => a.work.status === 'sent' && a.work.verdict === 'sdk'), gtm: count((a) => a.work.status === 'sent' && a.work.verdict === 'gtm') },
    mailedBefore: count((a) => /mail_sent/.test(a.mailStatus)),
    noEmail: count((a) => a.work.status === 'review' && !a.work.to),
    dismissed: count((a) => a.work.status === 'dismissed'),
    pipeline,
    pipelineTotal: d.pipeline.length,
    followUpsDue: d.pipeline.filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.nextFollowUp) && p.nextFollowUp <= today && !/closed|completed|lost/.test(p.status)).length,
    sentByDay: sentByDay(apps),
    job: d.job,
    sources: d.sources,
    hasKey: !!process.env.VIASOCKET_EMBED_SECRET
  }
}

function sentByDay(apps) {
  const out = {}
  for (const a of apps) if (a.work.sentAt) out[a.work.sentAt.slice(0, 10)] = (out[a.work.sentAt.slice(0, 10)] || 0) + 1
  return Object.entries(out).sort().slice(-14).map(([date, n]) => ({ date, n }))
}
