import { route, body } from '../../../../lib/eod/http.js'
import { requireRole, HttpError } from '../../../../lib/eod/auth.js'
import { createDraft, confirmEntry, retryEntry, myHistory, today } from '../../../../lib/eod/service.js'
import { addDays } from '../../../../lib/eod/dates.js'

export const dynamic = 'force-dynamic'

// The signed-in person's own entries only. Cross-employee data is under /api/eod/team (TL only).
export const GET = route(async (req) => {
  const me = requireRole(req, 'employee')
  const p = new URL(req.url).searchParams
  const to = p.get('to') || today()
  const from = p.get('from') || addDays(to, -30)
  return Response.json(await myHistory(me, { from, to }))
})

export const POST = route(async (req) => {
  const me = requireRole(req, 'employee')
  const b = await body(req)
  if (b.action === 'draft') return Response.json({ entry: await createDraft(me, b.message) })
  if (b.action === 'confirm') return Response.json({ entry: await confirmEntry(me, { entryId: String(b.entryId || ''), fields: b.fields }) })
  if (b.action === 'retry') return Response.json({ entry: await retryEntry(me, String(b.entryId || '')) })
  throw new HttpError(400, 'Unknown action')
})
