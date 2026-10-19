import { route, body } from '../../../../lib/eod/http.js'
import { requireRole, HttpError } from '../../../../lib/eod/auth.js'
import { teamStatus, teamHistory, tlBrief, monthlyRollup, missingCheck, roster, today, sendDailySummary, sendBriefToTl } from '../../../../lib/eod/service.js'

export const dynamic = 'force-dynamic'

// TL and admin only: enforced here on the server, whatever the browser shows.
export const GET = route(async (req) => {
  const me = requireRole(req, 'tl')
  const p = new URL(req.url).searchParams
  const view = p.get('view')
  if (view === 'status') return Response.json(await teamStatus(p.get('date') || today()))
  if (view === 'history') return Response.json({ rows: await teamHistory(me, { employeeId: p.get('employeeId') || '', from: p.get('from'), to: p.get('to') }) })
  if (view === 'roster') return Response.json({ members: roster().map((m) => ({ id: m.id, name: m.name })) })
  throw new HttpError(400, 'Unknown view')
})

export const POST = route(async (req) => {
  const me = requireRole(req, 'tl')
  const b = await body(req)
  if (b.action === 'brief') {
    const result = await tlBrief(me, { employeeId: b.employeeId || '', from: b.from, to: b.to, question: b.question })
    if (b.sendToSlack) {
      try { result.slack = await sendBriefToTl(me, result) } catch (e) { result.slack = { error: e.message } }
    }
    return Response.json(result)
  }
  if (b.action === 'daily_summary') return Response.json(await sendDailySummary(me, b.date || today(), { force: true }))
  if (b.action === 'rollup') return Response.json(await monthlyRollup(me, b.month))
  if (b.action === 'missing_check') return Response.json(await missingCheck(me, b.date || today()))
  throw new HttpError(400, 'Unknown action')
})
