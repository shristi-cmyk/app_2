import { readState } from '../../../lib/store.js'
import { APPS, listConnections } from '../../../lib/viasocket.js'
import { UID } from '../../../lib/user.js'

export const dynamic = 'force-dynamic'

// Never returns auth ids or script ids: only what the page needs to draw itself.
export async function GET() {
  const s = readState()
  // The account each app is connected as (the connection's label, e.g. the Google email). Best effort.
  const accounts = {}
  try {
    for (const c of await listConnections(UID)) {
      const key = Object.keys(APPS).find((k) => APPS[k].serviceId === c.service_id)
      if (!key || accounts[key]) continue
      try { accounts[key] = JSON.parse(c.connection_label).Email } catch { accounts[key] = c.connection_label }
    }
  } catch {}
  return Response.json({
    accounts,
    connected: { sheets: !!s.auth.sheets, docs: !!s.auth.docs, gmail: !!s.auth.gmail },
    active: s.subscription ? { ...s.subscription.config, tagOptions: undefined, createdAt: s.subscription.createdAt } : null
  })
}
