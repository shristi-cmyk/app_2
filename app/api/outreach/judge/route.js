import { startJudging, stopJudging } from '../../../../lib/outreach/service.js'

export async function POST(req) {
  const { limit, stop } = await req.json()
  if (stop) return Response.json(stopJudging())
  return Response.json(startJudging(Math.max(1, Math.min(Number(limit) || 25, 2000))))
}
