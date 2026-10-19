import { ActionError } from './vs.js'
import { log } from './log.js'

// Wraps a route: known errors become their status with a readable message; anything else is a 500.
// Failures of a connected app (Slack, Sheets, viaSocket) are 502 with the real reason.
export function route(fn) {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx)
    } catch (e) {
      const status = e.status || (e instanceof ActionError ? 502 : 500)
      if (status >= 500) log('route.error', { path: new URL(req.url).pathname, status, error: e.message })
      return Response.json({ error: e.message || 'Something went wrong' }, { status })
    }
  }
}

export async function body(req) {
  try { return await req.json() } catch { return {} }
}
