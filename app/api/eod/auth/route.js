import { route, body } from '../../../../lib/eod/http.js'
import { currentMember, login, sessionCookie, clearCookie, publicMember, HttpError } from '../../../../lib/eod/auth.js'
import { audit } from '../../../../lib/eod/db.js'

export const dynamic = 'force-dynamic'

export const GET = route(async (req) => Response.json({ member: publicMember(currentMember(req)) }))

export const POST = route(async (req) => {
  const b = await body(req)
  if (b.action === 'logout') {
    return Response.json({ ok: true }, { headers: { 'Set-Cookie': clearCookie() } })
  }
  if (b.action !== 'login') throw new HttpError(400, 'Unknown action')
  const m = login(b.email, b.password)
  audit(m, 'auth.login')
  return Response.json({ member: publicMember(m) }, { headers: { 'Set-Cookie': sessionCookie(m.id) } })
})
