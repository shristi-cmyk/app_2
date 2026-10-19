import { dashboard } from '../../../../lib/outreach/service.js'

export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json(dashboard())
}
