import { route, body } from '../../../../lib/eod/http.js'
import { requireRole, HttpError } from '../../../../lib/eod/auth.js'
import { audit, db } from '../../../../lib/eod/db.js'
import { EVENTS, eventStatus, setupFlow, dispatch, testEventId, pauseOrResume, recentDeliveries, retryDelivery, refreshFlows } from '../../../../lib/eod/events.js'
import { setupSchedule, scheduleStatus } from '../../../../lib/eod/service.js'

export const dynamic = 'force-dynamic'

export const GET = route(async (req) => {
  requireRole(req, 'admin')
  await refreshFlows()
  const events = await Promise.all(Object.keys(EVENTS).map((k) => eventStatus(k, { withRuns: true, fresh: false })))
  return Response.json({ events, schedule: await scheduleStatus(), settings: { reminderCron: db().settings.reminderCron, rollupCron: db().settings.rollupCron, appUrl: db().settings.appUrl }, deliveries: recentDeliveries() })
})

export const POST = route(async (req) => {
  const me = requireRole(req, 'admin')
  const b = await body(req)
  const key = b.event
  const needEvent = () => { if (!EVENTS[key]) throw new HttpError(400, 'Unknown event') }
  if (b.action === 'setup') {
    needEvent()
    const flowId = await setupFlow(key)
    audit(me, 'automation.setup', { event: key })
    return Response.json({ flowId })
  }
  // The builder reported a change; we answer with the flow's real state read from viaSocket.
  if (b.action === 'sync') {
    needEvent()
    return Response.json(await eventStatus(key, { withRuns: true }))
  }
  if (b.action === 'test') {
    needEvent()
    // The sample, clearly marked: is_test true and a test: event id. Never mixed with production events.
    const delivery = await dispatch(key, { ...EVENTS[key].sample, event_id: testEventId(key) }, { test: true })
    audit(me, 'automation.test', { event: key, status: delivery.status })
    return Response.json({ delivery })
  }
  if (b.action === 'retry') {
    const delivery = await retryDelivery(String(b.eventId || ''))
    audit(me, 'automation.retry', { eventId: b.eventId, status: delivery.status })
    return Response.json({ delivery })
  }
  if (b.action === 'pause' || b.action === 'resume') {
    needEvent()
    await pauseOrResume(key, b.action === 'resume')
    audit(me, `automation.${b.action}`, { event: key })
    return Response.json(await eventStatus(key))
  }
  if (b.action === 'schedule') return Response.json(await setupSchedule(me, { job: b.job || 'daily', cron: b.cron, appUrl: b.appUrl || db().settings.appUrl }))
  throw new HttpError(400, 'Unknown action')
})
