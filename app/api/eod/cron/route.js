import crypto from 'node:crypto'
import { route } from '../../../../lib/eod/http.js'
import { HttpError } from '../../../../lib/eod/auth.js'
import { missingCheck } from '../../../../lib/eod/service.js'

export const dynamic = 'force-dynamic'

// Called by the viaSocket schedule. A repeated delivery is harmless: each reminder is sent once per person per day.
export const POST = route(async (req) => {
  const key = process.env.EOD_CRON_KEY || ''
  const got = req.headers.get('x-eod-cron-key') || ''
  if (key.length < 16 || got.length !== key.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(key))) {
    throw new HttpError(401, 'Unauthorized')
  }
  return Response.json(await missingCheck(null))
})
