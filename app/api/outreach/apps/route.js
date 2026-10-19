import { db } from '../../../../lib/outreach/db.js'

export const dynamic = 'force-dynamic'

// ?status=review|judged|sent|new|dismissed &verdict=sdk|gtm|none &reason=<code> &q=<text>
export async function GET(req) {
  const p = new URL(req.url).searchParams
  const q = (p.get('q') || '').toLowerCase()
  const rows = Object.values(db().apps).filter((a) =>
    (!p.get('status') || a.work.status === p.get('status')) &&
    (!p.get('verdict') || a.work.verdict === p.get('verdict')) &&
    (!p.get('reason') || a.work.noneReason === p.get('reason')) &&
    (!q || `${a.name} ${a.domain} ${a.category}`.toLowerCase().includes(q)))
  const limit = Number(p.get('limit')) || 50
  return Response.json({ total: rows.length, items: rows.slice(0, limit) })
}
