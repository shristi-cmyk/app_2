import { db, change, DEFAULT_SETTINGS } from '../../../../lib/outreach/db.js'

export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json(db().settings)
}

export async function POST(req) {
  const body = await req.json()
  const next = Object.fromEntries(Object.keys(DEFAULT_SETTINGS).filter((k) => typeof body[k] === 'string').map((k) => [k, body[k]]))
  return Response.json(change((d) => Object.assign(d.settings, next)))
}
