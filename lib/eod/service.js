import crypto from 'node:crypto'
import { db, change, audit, withLock } from './db.js'
import { HttpError } from './auth.js'
import { todayIn, isDate, isWorkingDay, monthRange, workingDaysBetween } from './dates.js'
import { extract, normalizeFields, computeFlags, editedItems, MAX_MESSAGE_LEN } from './extract.js'
import { readAllEntries, appendEntry, findByEntryId } from './sheet.js'
import { postEntry, sendDm, postToTl, reminderText } from './slack.js'
import { dispatch } from './events.js'
import { consistency, writeBrief, briefText, asksForRating } from './brief.js'
import { listFlows, createFlow, updateFlow, readFlow } from './vs.js'
import { log } from './log.js'

// Entry statuses: Draft (extracted, waiting for the employee) -> Confirmed (employee approved; being
// written) -> Logged (in the sheet) or Flagged (in the sheet, needs a TL's eye). Missing: no entry by
// the end-of-day check. One entry per employee per day; its id is also the sheet's Entry ID.

const settings = () => db().settings
export const today = () => todayIn(settings().timezone)
export const entryIdFor = (date, memberId) => `eod_${date}_${memberId}`
const LOGGED = new Set(['Logged', 'Flagged'])

function publicEntry(e) {
  if (!e) return null
  const { raw, ...rest } = e
  return { ...rest, message: raw }
}

export async function createDraft(member, message) {
  if (!member.inRoster) throw new HttpError(403, 'You are not on the EOD roster. Ask an admin to add you.')
  const raw = String(message || '').trim()
  if (!raw) throw new HttpError(400, 'Tell me what you did today, any blockers, and your plan for tomorrow.')
  if (raw.length > MAX_MESSAGE_LEN) throw new HttpError(400, `Please keep it under ${MAX_MESSAGE_LEN} characters.`)
  const date = today()
  const id = entryIdFor(date, member.id)
  return withLock('entry:' + id, async () => {
    const existing = db().entries[id]
    if (existing && LOGGED.has(existing.status)) throw new HttpError(409, 'Your EOD for today is already logged.')
    if (existing?.status === 'Confirmed') throw new HttpError(409, 'Your EOD for today is being logged. Use Retry if it is stuck.')
    const { kept, dropped } = await extract(raw, id)
    const now = new Date().toISOString()
    const entry = change((d) => {
      d.entries[id] = {
        ...(d.entries[id] || {}),
        id, memberId: member.id, date, status: 'Draft', raw,
        draft: kept, dropped, flags: computeFlags(kept, raw, { dropped }),
        createdAt: d.entries[id]?.createdAt || now, updatedAt: now
      }
      return d.entries[id]
    })
    audit(member, 'entry.draft', { entryId: id, items: kept.done.length + kept.blockers.length + kept.plan.length, droppedByCheck: dropped.length })
    return publicEntry(entry)
  })
}

export async function confirmEntry(member, { entryId, fields }) {
  const entry0 = db().entries[entryId]
  // Employees confirm only their own entry; ids are checked against the session, not trusted from the body.
  if (!entry0 || entry0.memberId !== member.id) throw new HttpError(404, 'No draft to confirm.')
  let confirmed
  try { confirmed = normalizeFields(fields) } catch (e) { throw new HttpError(400, e.message) }
  if (!confirmed.done.length && !confirmed.blockers.length && !confirmed.plan.length) throw new HttpError(400, 'The update is empty.')
  return withLock('entry:' + entryId, async () => {
    const e = db().entries[entryId]
    if (LOGGED.has(e.status)) return publicEntry(e) // already logged: same answer, no second write
    if (e.status !== 'Draft' && e.status !== 'Confirmed') throw new HttpError(409, 'No draft to confirm.')
    if (e.status === 'Draft') {
      const edits = editedItems(e.draft, confirmed)
      change((d) => {
        Object.assign(d.entries[entryId], {
          status: 'Confirmed', fields: confirmed, edits,
          flags: computeFlags(confirmed, e.raw, { dropped: e.dropped }),
          submittedAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        })
      })
      audit(member, 'entry.confirmed', { entryId, editedItems: edits.length })
    }
    return publicEntry(await processEntry(entryId))
  })
}

// Sheet, then Slack, then the event. Each step is recorded, so a retry resumes where it stopped and
// never writes a second row, posts twice or sends the event twice.
async function processEntry(entryId) {
  const e = () => db().entries[entryId]
  const member = db().members[e().memberId]
  const setError = (k, msg) => change((d) => { d.entries[entryId].errors = { ...(d.entries[entryId].errors || {}), [k]: msg } })
  const clearError = (k) => change((d) => { if (d.entries[entryId].errors) delete d.entries[entryId].errors[k] })

  if (!e().sheet) {
    try {
      // A row from an earlier attempt whose answer was lost is found by its Entry ID instead of re-added.
      const found = await findByEntryId(entryId)
      const sheet = found ? { rowNumber: found.rowNumber, sheetRowId: found.sheetRowId } : await appendEntry(e(), member)
      change((d) => {
        Object.assign(d.entries[entryId], { sheet, status: d.entries[entryId].flags.length ? 'Flagged' : 'Logged', updatedAt: new Date().toISOString() })
      })
      clearError('sheet')
      audit(member, 'entry.logged', { entryId, sheetRowId: sheet.sheetRowId, status: e().status, reused: !!found })
      log('entry.logged', { entryId, sheetRowId: sheet.sheetRowId })
    } catch (err) {
      setError('sheet', err.message)
      log('entry.sheet_failed', { entryId, error: err.message })
      return e()
    }
  }

  if (!e().slack?.ts) {
    try {
      const slack = await postEntry(member, e())
      change((d) => { d.entries[entryId].slack = slack })
      clearError('slack')
      audit(member, 'entry.slack_posted', { entryId })
    } catch (err) {
      setError('slack', err.message)
      log('entry.slack_failed', { entryId, error: err.message })
    }
  }

  const ev = e()
  const delivery = await dispatch('eod_entry_submitted', {
    event_id: `eod_entry_submitted:${entryId}`,
    entry_id: entryId, employee_id: member.id, employee_name: member.name, employee_email: member.email,
    date: ev.date,
    done: ev.fields.done.map((x) => `• ${x}`).join('\n'), blockers: ev.fields.blockers.map((x) => `• ${x}`).join('\n'), plan: ev.fields.plan.map((x) => `• ${x}`).join('\n'),
    done_items: ev.fields.done, blockers_items: ev.fields.blockers, plan_items: ev.fields.plan,
    status: ev.status, flags: ev.flags.map((f) => f.message),
    slack_message_ts: ev.slack?.ts || '', slack_channel_id: ev.slack?.channel || '',
    sheet_row_id: ev.sheet.sheetRowId || '', sheet_row_number: ev.sheet.rowNumber || null,
    submitted_at: ev.submittedAt
  }).catch((err) => ({ status: 'failed', lastError: err.message }))
  change((d) => { d.entries[entryId].event = { status: delivery.status, lastError: delivery.lastError || '' } })
  return e()
}

export async function retryEntry(actor, entryId) {
  const e = db().entries[entryId]
  if (!e) throw new HttpError(404, 'No such entry.')
  if (e.memberId !== actor.id && actor.role === 'employee') throw new HttpError(404, 'No such entry.')
  if (!['Confirmed', 'Logged', 'Flagged'].includes(e.status)) throw new HttpError(409, 'Only confirmed entries can be retried.')
  audit(actor, 'entry.retry', { entryId })
  return withLock('entry:' + entryId, async () => publicEntry(await processEntry(entryId)))
}

// ---- Reading the sheet (source of truth) ----

// Rows this app wrote carry the member id in their Entry ID. Only rows typed into the sheet by hand
// (no app Entry ID) fall back to the employee's name; an app row is never re-attributed by name.
const memberOfRow = (row, members) => {
  const m = /^eod_\d{4}-\d{2}-\d{2}_(m_[a-f0-9]+)$/.exec(row.entryId)
  if (m) return members[m[1]] || null
  const name = row.employee.toLowerCase()
  if (!name) return null
  return Object.values(members).find((x) => x.name.toLowerCase() === name) || null
}

async function sheetEntries() {
  const members = db().members
  return (await readAllEntries()).map((r) => ({ ...r, memberId: memberOfRow(r, members)?.id || null }))
}

function checkRange(from, to) {
  if (!isDate(from) || !isDate(to) || from > to) throw new HttpError(400, 'Pick a valid date range.')
}

// The employee's own history: their rows only, with this app's status for each.
export async function myHistory(member, { from, to }) {
  checkRange(from, to)
  const rows = (await sheetEntries()).filter((r) => r.memberId === member.id && r.date >= from && r.date <= to)
  const local = db().entries
  const todayEntry = local[entryIdFor(today(), member.id)]
  return {
    today: publicEntry(todayEntry && todayEntry.memberId === member.id ? todayEntry : null),
    rows: rows.map((r) => ({ ...r, status: local[r.entryId]?.status || 'Logged' })).sort((a, b) => (a.date < b.date ? 1 : -1))
  }
}

export const roster = () => Object.values(db().members).filter((m) => m.active && m.inRoster)

export async function teamStatus(date) {
  if (!isDate(date)) throw new HttpError(400, 'Pick a valid date.')
  let rows = []
  let sheetError = null
  try { rows = (await sheetEntries()).filter((r) => r.date === date) } catch (e) { sheetError = e.message }
  const local = db().entries
  return {
    date, workingDay: isWorkingDay(date, settings().workingDays), sheetError,
    members: roster().map((m) => {
      const row = rows.find((r) => r.memberId === m.id)
      const e = local[entryIdFor(date, m.id)]
      const status = row ? (e?.status === 'Flagged' ? 'Flagged' : 'Logged') : e?.status || 'Not submitted'
      const reminder = db().reminders[`${date}:${m.id}`]
      return { id: m.id, name: m.name, status, sheetRowId: row?.sheetRowId || null, reminder: reminder ? { status: reminder.status, at: reminder.at } : null }
    })
  }
}

export async function teamHistory(actor, { employeeId, from, to }) {
  checkRange(from, to)
  const rows = (await sheetEntries()).filter((r) => r.date >= from && r.date <= to && (!employeeId || r.memberId === employeeId))
  audit(actor, 'tl.history_viewed', { employeeId: employeeId || 'team', from, to, rows: rows.length })
  const local = db().entries
  return rows.map((r) => ({ ...r, status: local[r.entryId]?.status || 'Logged' })).sort((a, b) => (a.date < b.date ? 1 : -1))
}

// ---- TL briefs ----

const REFUSAL = 'I only prepare evidence from logged entries; any evaluation is your decision. Here is the evidence for that period.'

export async function tlBrief(actor, { employeeId, from, to, question = '' }) {
  checkRange(from, to)
  question = String(question || '').slice(0, 1000)
  const members = employeeId ? [db().members[employeeId]].filter(Boolean) : roster()
  if (employeeId && !members.length) throw new HttpError(404, 'No such employee.')
  const all = await sheetEntries()
  const ids = new Set(members.map((m) => m.id))
  const entries = all.filter((r) => r.date >= from && r.date <= to && r.memberId && ids.has(r.memberId)).sort((a, b) => (a.date < b.date ? -1 : 1))
  const queryId = 'q_' + crypto.randomBytes(6).toString('hex')
  const wantsRating = asksForRating(question)
  const cappedTo = to > today() ? today() : to
  const cons = consistency(entries, members, from, cappedTo < from ? from : cappedTo, settings().workingDays)
  const brief = await writeBrief({ entries, question: wantsRating ? '' : question, threadId: `brief-${queryId}` })
  if (wantsRating) brief.answer = REFUSAL
  const result = { queryId, scope: employeeId ? 'employee' : 'team', from, to, question, consistency: cons, ...brief, entriesConsidered: entries.length }
  change((d) => { d.queries[queryId] = { id: queryId, by: actor.id, at: new Date().toISOString(), scope: result.scope, employeeId: employeeId || null, from, to, question, entries: entries.length } })
  audit(actor, 'tl.brief', { queryId, scope: result.scope, employeeId: employeeId || null, from, to, entries: entries.length, removedEvaluative: brief.removed, askedForRating: wantsRating })
  const subject = employeeId ? members[0] : null
  result.event = await dispatch('tl_summary_requested', {
    event_id: `tl_summary_requested:${queryId}`, query_id: queryId,
    requested_by_id: actor.id, requested_by_name: actor.name, scope: result.scope,
    employee_id: subject?.id || '', employee_name: subject?.name || '', from, to, question,
    entries_considered: entries.length, brief: briefText(result), requested_at: new Date().toISOString()
  }).catch((e) => ({ status: 'failed', lastError: e.message }))
  return result
}

export async function monthlyRollup(actor, month) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) throw new HttpError(400, 'Pick a month.')
  const { from, to } = monthRange(month)
  const result = await tlBrief(actor, { from, to })
  const text = `*Monthly EOD rollup · ${month}*\n_Evidence only; any evaluation is the TL's decision._\n${briefText(result)}`
  let slack = null
  try { slack = await postToTl(text) } catch (e) { slack = { error: e.message } }
  result.slack = slack
  result.rollupEvent = await dispatch('monthly_rollup_generated', {
    event_id: `monthly_rollup_generated:${result.queryId}`, query_id: result.queryId, month, from, to,
    working_days: workingDaysBetween(from, to > today() ? today() : to, settings().workingDays).length,
    generated_by_id: actor.id, generated_by_name: actor.name, employees_count: result.consistency.length,
    per_employee: result.consistency.map(({ missing_dates, ...c }) => c),
    brief: briefText(result), generated_at: new Date().toISOString()
  }).catch((e) => ({ status: 'failed', lastError: e.message }))
  audit(actor, 'tl.rollup', { queryId: result.queryId, month, slackPosted: !!slack?.ts })
  return result
}

// ---- End-of-day check ----

export async function missingCheck(actor, date = today()) {
  if (!isDate(date)) throw new HttpError(400, 'Pick a valid date.')
  if (!isWorkingDay(date, settings().workingDays)) return { date, skipped: 'Not a working day', missing: [] }
  const status = await teamStatus(date)
  if (status.sheetError) throw new HttpError(502, `Could not read the sheet: ${status.sheetError}`)
  const missing = status.members.filter((m) => !LOGGED.has(m.status))
  const out = []
  for (const m of missing) {
    const member = db().members[m.id]
    const key = `${date}:${m.id}`
    const r = await withLock('reminder:' + key, async () => {
      const prior = db().reminders[key]
      if (prior?.status === 'sent') return prior
      let rec
      if (!member.slackUserId) rec = { status: 'no_slack_user', at: new Date().toISOString() }
      else {
        try {
          await sendDm(member.slackUserId, reminderText(member, date, settings().appUrl))
          rec = { status: 'sent', at: new Date().toISOString() }
        } catch (e) { rec = { status: 'failed', error: e.message, at: new Date().toISOString() } }
      }
      change((d) => {
        d.reminders[key] = rec
        const id = entryIdFor(date, m.id)
        if (!d.entries[id]) d.entries[id] = { id, memberId: m.id, date, status: 'Missing', flags: [], createdAt: rec.at, updatedAt: rec.at }
      })
      return rec
    })
    const delivery = await dispatch('eod_entry_missing', {
      event_id: `eod_entry_missing:${date}:${m.id}`, employee_id: m.id, employee_name: member.name, employee_email: member.email,
      date, reminder_sent: r.status === 'sent', reminder_channel: 'slack_dm', reminder_error: r.error || (r.status === 'no_slack_user' ? 'No Slack user set for this member' : ''),
      checked_at: new Date().toISOString()
    }).catch((e) => ({ status: 'failed', lastError: e.message }))
    out.push({ id: m.id, name: member.name, reminder: r.status, reminderError: r.error || '', event: delivery.status })
  }
  audit(actor, 'eod.missing_check', { date, missing: out.length, rosterSize: status.members.length })
  log('eod.missing_check', { date, missing: out.length })
  return { date, missing: out, submitted: status.members.length - missing.length }
}

// ---- Review ----

export function flagged() {
  const members = db().members
  return Object.values(db().entries)
    .filter((e) => e.status === 'Flagged' || (e.errors && Object.keys(e.errors).length))
    .map((e) => ({ ...publicEntry(e), employee: members[e.memberId]?.name || '?' }))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
}

export function resolveFlag(actor, entryId, note) {
  const e = db().entries[entryId]
  if (!e || e.status !== 'Flagged') throw new HttpError(404, 'No flagged entry with that id.')
  change((d) => {
    Object.assign(d.entries[entryId], { status: 'Logged', review: { by: actor.id, byName: actor.name, at: new Date().toISOString(), note: String(note || '').slice(0, 1000) }, updatedAt: new Date().toISOString() })
  })
  audit(actor, 'review.resolved', { entryId })
  return publicEntry(db().entries[entryId])
}

// ---- TL summaries on Slack ----

// The day's team summary for the TL review channel/DM. TL-only destination, so it may name people.
export async function dailySummary(date = today()) {
  const st = await teamStatus(date)
  if (st.sheetError) throw new HttpError(502, `Could not read the sheet: ${st.sheetError}`)
  const rows = (await sheetEntries()).filter((r) => r.date === date)
  const logged = st.members.filter((m) => LOGGED.has(m.status))
  const missing = st.members.filter((m) => !LOGGED.has(m.status))
  const flaggedNow = st.members.filter((m) => m.status === 'Flagged')
  const blockers = rows.filter((r) => r.memberId && r.blockers.length)
  const lines = [
    `*EOD summary · ${date}*`,
    `Submitted: ${logged.length} of ${st.members.length}`,
    missing.length ? `*Not submitted (reminded privately)*\n${missing.map((m) => `• ${m.name}`).join('\n')}` : 'Everyone submitted.',
    flaggedNow.length ? `*Needs review*\n${flaggedNow.map((m) => `• ${m.name}`).join('\n')}` : '',
    blockers.length ? `*Blockers today*\n${blockers.map((r) => `• ${r.employee}: ${r.blockers.join('; ')} (row ${r.sheetRowId})`).join('\n')}` : 'No blockers reported.'
  ].filter(Boolean)
  return lines.join('\n')
}

// Sends the day's summary to the TL once per date; a repeated run (or a second cron delivery) does not resend.
export async function sendDailySummary(actor, date = today(), { force = false } = {}) {
  return withLock('summary:' + date, async () => {
    const prior = db().summaries?.[date]
    if (prior?.status === 'sent' && !force) return { ...prior, duplicate: true }
    let rec
    try {
      const slack = await postToTl(await dailySummary(date))
      rec = { status: 'sent', at: new Date().toISOString(), ts: slack.ts }
    } catch (e) { rec = { status: 'failed', at: new Date().toISOString(), error: e.message } }
    change((d) => { d.summaries = { ...(d.summaries || {}), [date]: rec } })
    audit(actor, 'tl.daily_summary', { date, status: rec.status, forced: force })
    return rec
  })
}

// An on-demand brief, sent to the TL review channel/DM.
export async function sendBriefToTl(actor, result) {
  const who = result.scope === 'team' ? 'Team' : result.consistency[0]?.employee_name
  const text = `*EOD brief · ${who} · ${result.from} to ${result.to}*\n_Evidence only; any evaluation is the TL's decision._\n${briefText(result)}`
  const slack = await postToTl(text)
  audit(actor, 'tl.brief_sent', { queryId: result.queryId })
  return slack
}

const SYSTEM = { id: 'system', name: 'Scheduled job', role: 'admin' }

export function previousMonth(date = today()) {
  const [y, m] = date.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

// End of month: the rollup of the month that just ended, once per month.
export async function scheduledRollup(month = previousMonth()) {
  return withLock('rollup:' + month, async () => {
    const prior = db().rollups?.[month]
    if (prior?.status === 'sent') return { month, ...prior, duplicate: true }
    const r = await monthlyRollup(SYSTEM, month)
    const rec = r.slack?.ts ? { status: 'sent', at: new Date().toISOString() } : { status: 'failed', at: new Date().toISOString(), error: r.slack?.error || 'not posted' }
    change((d) => { d.rollups = { ...(d.rollups || {}), [month]: rec } })
    return { month, ...rec, event: r.rollupEvent?.status }
  })
}

// ---- Schedules (viaSocket cron automations that call this app) ----

export const JOBS = {
  daily: {
    title: 'EOD · End-of-day missing check',
    description: 'Sends private Slack reminders to anyone without an EOD entry, then the day\'s summary to the TL.',
    path: '/api/eod/cron?job=daily', setting: 'reminderCron'
  },
  monthly: {
    title: 'EOD · Monthly rollup',
    description: 'On the 1st, sends the TL the evidence rollup for the month that just ended.',
    path: '/api/eod/cron?job=monthly', setting: 'rollupCron'
  }
}

export async function setupSchedule(actor, { job = 'daily', cron, appUrl }) {
  const j = JOBS[job]
  if (!j) throw new HttpError(400, 'Unknown schedule')
  const key = process.env.EOD_CRON_KEY
  if (!key || key.length < 16) throw new HttpError(503, 'Set EOD_CRON_KEY (16+ characters) on the server first.')
  if (!/^https:\/\/[^\s/]+/.test(appUrl || '')) throw new HttpError(400, 'Set the app URL (https://…) first.')
  if (!cron?.trim()) throw new HttpError(400, 'Enter a schedule.')
  const url = `${appUrl.replace(/\/$/, '')}${j.path}`
  // The key is baked into the step on viaSocket's side; it never goes to the browser.
  const steps = [{
    stepname: `run_${job}`,
    code: `const r = await axios.post(${JSON.stringify(url)}, {}, { headers: { 'x-eod-cron-key': ${JSON.stringify(key)} }, timeout: 55000 });\nconsole.log('### ${job} job: ' + JSON.stringify({ date: r.data?.date, month: r.data?.month, status: r.data?.status || r.data?.summary?.status }));\nreturn { ok: true };`,
    service_action_functions: []
  }]
  const trigger = { triggerType: 'cron', cronStatement: cron.trim() }
  const stored = db().schedules?.[job]?.flowId || (job === 'daily' ? db().schedule?.flowId : null)
  const existing = stored || (await listFlows()).find((f) => f.title === j.title && f.status !== 'deleted')?.id
  let flowId = existing
  if (existing) await updateFlow(existing, { trigger, steps })
  else flowId = await createFlow({ title: j.title, description: j.description, trigger, steps })
  const back = await readFlow(flowId)
  change((d) => {
    d.settings[j.setting] = cron.trim()
    d.settings.appUrl = appUrl.replace(/\/$/, '')
    d.schedules = { ...(d.schedules || {}), [job]: { flowId, cron: cron.trim(), understoodAs: back?.trigger?.cron_statement || '', savedAt: new Date().toISOString() } }
  })
  audit(actor, 'schedule.saved', { job, cron: cron.trim() })
  return db().schedules[job]
}

export async function scheduleStatus() {
  let flows
  try { flows = await listFlows() } catch (e) { return Object.fromEntries(Object.keys(JOBS).map((k) => [k, { state: 'error', error: e.message }])) }
  const out = {}
  for (const job of Object.keys(JOBS)) {
    const s = db().schedules?.[job] || (job === 'daily' ? db().schedule : null)
    const flow = s?.flowId && flows.find((f) => f.id === s.flowId)
    out[job] = !s?.flowId ? { state: 'not_set_up' } : !flow ? { state: 'missing' }
      : { state: flow.status === 'active' ? 'active' : flow.status, cron: s.cron, understoodAs: s.understoodAs }
  }
  return out
}
