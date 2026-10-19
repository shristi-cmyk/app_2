import crypto from 'node:crypto'
import { db, change, withLock } from './db.js'
import { listFlows, createFlow, readFlow, flowRuns, setFlowStatus, ActionError } from './vs.js'

// Product events. Each one is a viaSocket flow with a webhook trigger, created from code and then
// opened in the prebuilt UI so the admin adds what happens next, mapping fields from the sample.
// At runtime the server POSTs the real event to the flow's URL, which it reads back from viaSocket
// (the integrations list), never from the browser.

const SAMPLE_TS = '2026-10-19T18:42:10.000Z'

export const EVENTS = {
  eod_entry_submitted: {
    label: 'EOD Entry Submitted',
    description: 'An employee confirmed their EOD update; it was written to the sheet and posted to the EOD channel.',
    sample: {
      event: 'eod_entry_submitted', event_id: 'eod_entry_submitted:sample', is_test: true, occurred_at: SAMPLE_TS,
      entry_id: 'eod_2026-10-19_m_sample', employee_id: 'm_sample', employee_name: 'Asha Verma', employee_email: 'asha@example.com',
      date: '2026-10-19',
      done: '• Fixed the login redirect bug\n• Reviewed 2 PRs', blockers: '• Waiting on staging DB access', plan: '• Write checkout tests',
      done_items: ['Fixed the login redirect bug', 'Reviewed 2 PRs'], blockers_items: ['Waiting on staging DB access'], plan_items: ['Write checkout tests'],
      status: 'Logged', flags: [], slack_message_ts: '1792395854.041589', slack_channel_id: 'C0123456789',
      sheet_row_id: '0:42', sheet_row_number: 42, submitted_at: SAMPLE_TS
    }
  },
  eod_entry_missing: {
    label: 'EOD Entry Missing',
    description: 'The end-of-day check found an employee with no entry for a working day. They got a private Slack reminder.',
    sample: {
      event: 'eod_entry_missing', event_id: 'eod_entry_missing:sample', is_test: true, occurred_at: SAMPLE_TS,
      employee_id: 'm_sample', employee_name: 'Asha Verma', employee_email: 'asha@example.com', date: '2026-10-19',
      reminder_sent: true, reminder_channel: 'slack_dm', reminder_error: '', checked_at: SAMPLE_TS
    }
  },
  monthly_rollup_generated: {
    label: 'Monthly Rollup Generated',
    description: 'A TL generated the monthly evidence brief for the team (no ratings or scores).',
    sample: {
      event: 'monthly_rollup_generated', event_id: 'monthly_rollup_generated:sample', is_test: true, occurred_at: SAMPLE_TS,
      query_id: 'q_sample', month: '2026-10', from: '2026-10-01', to: '2026-10-31', working_days: 23,
      generated_by_id: 'm_tl', generated_by_name: 'Ravi (TL)', employees_count: 2,
      per_employee: [{ employee_id: 'm_sample', employee_name: 'Asha Verma', days_logged: 21, working_days: 23 }],
      brief: 'Consistency: Asha Verma logged 21 of 23 working days. Recurring blocker: staging DB access (rows 0:12, 0:30).',
      generated_at: SAMPLE_TS
    }
  },
  tl_summary_requested: {
    label: 'TL Summary Requested',
    description: 'A TL asked for an evidence brief of one employee or the whole team over a date range.',
    sample: {
      event: 'tl_summary_requested', event_id: 'tl_summary_requested:sample', is_test: true, occurred_at: SAMPLE_TS,
      query_id: 'q_sample', requested_by_id: 'm_tl', requested_by_name: 'Ravi (TL)', scope: 'employee',
      employee_id: 'm_sample', employee_name: 'Asha Verma', from: '2026-10-01', to: '2026-10-19',
      question: 'Any recurring blockers?', entries_considered: 13,
      brief: 'Consistency: 13 of 14 working days logged. Recurring blocker: staging DB access.', requested_at: SAMPLE_TS
    }
  }
}

const titleOf = (key) => `EOD · ${EVENTS[key].label}`

// The step every new flow starts with: it records that the event arrived (ids only, no entry content in
// the run log) and returns them. The admin adds the real work after it in the builder.
const DEFAULT_STEP = {
  stepname: 'received',
  code: [
    'const event = context?.req?.body?.event;',
    'const eventId = context?.req?.body?.event_id;',
    'const isTest = !!context?.req?.body?.is_test;',
    'console.log(`### ${event} received (${isTest ? "test" : "live"}) ${eventId}`);',
    'return { received: true, event, event_id: eventId, is_test: isTest };'
  ].join('\n'),
  service_action_functions: []
}

let flowCache = { at: 0, flows: null }
async function flowsNow(fresh = false) {
  if (!fresh && flowCache.flows && Date.now() - flowCache.at < 30_000) return flowCache.flows
  flowCache = { at: Date.now(), flows: await listFlows() }
  return flowCache.flows
}

// The stored flow for an event, rediscovered by title if the local file was lost.
async function flowFor(key, fresh) {
  const flows = await flowsNow(fresh)
  const stored = db().flows[key]?.flowId
  let flow = stored && flows.find((f) => f.id === stored)
  if (!flow) {
    flow = flows.find((f) => f.title === titleOf(key) && f.status !== 'deleted')
    if (flow) change((d) => { d.flows[key] = { flowId: flow.id, createdAt: new Date().toISOString() } })
  }
  return flow || null
}

export async function setupFlow(key) {
  if (!EVENTS[key]) throw new ActionError('Unknown event')
  return withLock('flow:' + key, async () => {
    const existing = await flowFor(key, true)
    if (existing && existing.status !== 'deleted') return existing.id
    const flowId = await createFlow({
      title: titleOf(key),
      description: EVENTS[key].description,
      trigger: { triggerType: 'webhook' },
      steps: [DEFAULT_STEP]
    })
    change((d) => { d.flows[key] = { flowId, createdAt: new Date().toISOString() } })
    flowCache.at = 0
    return flowId
  })
}

// Real state from viaSocket: not set up, incomplete, active, paused, deleted, or an error.
export async function eventStatus(key, { withRuns = false, fresh = true } = {}) {
  const base = { key, label: EVENTS[key].label, description: EVENTS[key].description, sample: EVENTS[key].sample }
  try {
    const flow = await flowFor(key, fresh)
    if (!flow) return { ...base, state: 'not_set_up' }
    let steps = null
    try { steps = (await readFlow(flow.id)).steps || [] } catch (e) { return { ...base, flowId: flow.id, state: 'error', error: e.message } }
    const state = flow.status === 'deleted' ? 'deleted' : flow.status === 'paused' ? 'paused'
      : flow.status !== 'active' || !flow.webhook ? 'incomplete' : steps.length === 0 ? 'incomplete' : 'active'
    const out = {
      ...base, flowId: flow.id, state, flowStatus: flow.status,
      steps: steps.map((s) => s.stepname),
      // The body viaSocket derives from what the flow's steps read (not from the events sent).
      payloadFields: flow.payload?.body && typeof flow.payload.body === 'object' ? Object.keys(flow.payload.body) : [],
      lastDelivery: lastDelivery(key)
    }
    if (withRuns) {
      try { out.runs = await flowRuns(flow.id, 5) } catch (e) { out.runsError = e.message }
    }
    return out
  } catch (e) {
    return { ...base, state: 'error', error: e.message }
  }
}

function lastDelivery(key) {
  const list = Object.values(db().deliveries).filter((x) => x.event === key)
  list.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  return list[0] ? publicDelivery(list[0]) : null
}

export const publicDelivery = ({ payload, ...rest }) => rest

export function recentDeliveries(limit = 30) {
  return Object.values(db().deliveries).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, limit).map(publicDelivery)
}

export async function retryDelivery(eventId) {
  const d = db().deliveries[eventId]
  if (!d) throw new ActionError('No such delivery.')
  if (d.status === 'delivered') return publicDelivery(d)
  return dispatch(d.event, d.payload, { test: d.isTest })
}

export async function pauseOrResume(key, resume) {
  const flow = await flowFor(key, true)
  if (!flow) throw new ActionError('This event has no flow yet.')
  await setFlowStatus(flow.id, resume ? 1 : 2)
  flowCache.at = 0
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// At most once per event_id: a retried request, a double click or a repeated cron run reuses the record.
export async function dispatch(key, payload, options) {
  return publicDelivery(await deliver(key, payload, options))
}

async function deliver(key, payload, { test = false } = {}) {
  if (!EVENTS[key]) throw new ActionError('Unknown event')
  const eventId = payload.event_id
  if (!eventId) throw new ActionError('event_id is required')
  return withLock('delivery:' + eventId, async () => {
    const prior = db().deliveries[eventId]
    if (prior?.status === 'delivered') return { ...prior, duplicate: true }

    const record = (patch) => change((d) => {
      // The payload is kept (server-side only) so a failed delivery can be retried as it was.
      d.deliveries[eventId] = { ...(d.deliveries[eventId] || { eventId, event: key, isTest: test, attempts: 0, createdAt: new Date().toISOString() }), payload, ...patch, updatedAt: new Date().toISOString() }
      return d.deliveries[eventId]
    })

    let flow
    try { flow = await flowFor(key, true) } catch (e) { return record({ status: 'failed', lastError: `viaSocket unreachable: ${e.message}` }) }
    if (!flow) return record({ status: 'not_configured', lastError: 'No flow is set up for this event.' })
    if (flow.status !== 'active' || !flow.webhook) return record({ status: 'not_active', lastError: `The flow is ${flow.status || 'not published'}.` })

    const body = { ...payload, event: key, event_id: eventId, is_test: test, occurred_at: payload.occurred_at || new Date().toISOString() }
    let lastError = ''
    for (let attempt = 1; attempt <= 3; attempt++) {
      record({ status: 'sending', attempts: (db().deliveries[eventId]?.attempts || 0) + 1 })
      try {
        const response = await fetch(flow.webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': eventId },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(60_000)
        })
        const text = await response.text()
        if (response.ok) return record({ status: 'delivered', deliveredAt: new Date().toISOString(), lastError: '', flowId: flow.id })
        lastError = `HTTP ${response.status}: ${text.slice(0, 200)}`
        // 400 is viaSocket's own answer (paused, deleted, 58-second limit): retrying the same thing won't help.
        if (response.status === 400) break
      } catch (e) {
        lastError = e.name === 'TimeoutError' ? 'Timed out' : e.message
      }
      if (attempt < 3) await sleep(attempt * 1500)
    }
    return record({ status: 'failed', lastError })
  })
}

// One read of the flow list for a page that shows every event.
export const refreshFlows = () => flowsNow(true)

export const testEventId = (key) => `test:${key}:${crypto.randomBytes(4).toString('hex')}`
