import { route } from '../../../../lib/eod/http.js'
import { requireRole } from '../../../../lib/eod/auth.js'
import { db } from '../../../../lib/eod/db.js'

export const dynamic = 'force-dynamic'

export const GET = route(async (req) => {
  requireRole(req, 'admin')
  return Response.json({ audit: db().audit.slice(-300).reverse() })
})
