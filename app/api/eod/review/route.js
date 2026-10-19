import { route, body } from '../../../../lib/eod/http.js'
import { requireRole } from '../../../../lib/eod/auth.js'
import { flagged, resolveFlag, retryEntry } from '../../../../lib/eod/service.js'

export const dynamic = 'force-dynamic'

export const GET = route(async (req) => {
  requireRole(req, 'tl')
  return Response.json({ entries: flagged() })
})

export const POST = route(async (req) => {
  const me = requireRole(req, 'tl')
  const b = await body(req)
  if (b.action === 'retry') return Response.json({ entry: await retryEntry(me, String(b.entryId || '')) })
  return Response.json({ entry: resolveFlag(me, String(b.entryId || ''), b.note) })
})
