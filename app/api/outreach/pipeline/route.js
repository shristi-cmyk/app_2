import { db } from '../../../../lib/outreach/db.js'
import { updatePipeline } from '../../../../lib/outreach/service.js'

export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json(db().pipeline.map((p, index) => ({ ...p, index })))
}

export async function POST(req) {
  const { index, ...patch } = await req.json()
  try {
    return Response.json(updatePipeline(index, patch))
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 })
  }
}
