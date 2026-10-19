import crypto from 'node:crypto'
import { route } from '../../../../lib/eod/http.js'
import { HttpError } from '../../../../lib/eod/auth.js'
import { missingCheck, sendDailySummary, scheduledRollup, today } from '../../../../lib/eod/service.js'

export const dynamic = 'force-dynamic'

// Called by the viaSocket schedules. A repeated delivery is harmless: each reminder, daily summary and monthly
// rollup is sent once (per person per day, per day, per month).
export const POST = route(async (req) => {
  const key = process.env.EOD_CRON_KEY || ''
  const got = req.headers.get('x-eod-cron-key') || ''
  if (key.length < 16 || got.length !== key.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(key))) {
    throw new HttpError(401, 'Unauthorized')
  }
  const job = new URL(req.url).searchParams.get('job') || 'daily'
  if (job === 'monthly') return Response.json(await scheduledRollup())
  if (job !== 'daily') throw new HttpError(400, 'Unknown job')
  const date = today()
  const result = await missingCheck(null, date)
  // The TL summary follows the reminders, on working days only.
  const summary = result.skipped ? null : await sendDailySummary(null, date)
  return Response.json({ ...result, summary })
})
