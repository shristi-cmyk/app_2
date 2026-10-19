import { setFlowStatus } from '../../../lib/viasocket.js'
import { UID } from '../../../lib/user.js'
import { readState, updateState } from '../../../lib/store.js'

export async function POST() {
  const s = readState()
  try {
    if (s.subscription) await setFlowStatus(UID, s.subscription.scriptId, 0)
    updateState((st) => { st.subscription = null })
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
