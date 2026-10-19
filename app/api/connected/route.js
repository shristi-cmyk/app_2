import { APPS, enableApp } from '../../../lib/viasocket.js'
import { UID } from '../../../lib/user.js'
import { updateState } from '../../../lib/store.js'

export async function POST(req) {
  const { app, authId } = await req.json()
  if (!APPS[app] || !authId) return Response.json({ error: 'bad request' }, { status: 400 })
  try {
    // Each app is enabled once so its actions can run (Sheets: Partner Outreach reads rows with it).
    const scriptId = await enableApp(UID, authId, APPS[app].serviceId)
    updateState((s) => {
      s.auth[app] = authId
      if (scriptId) s.scripts[app] = scriptId
    })
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
