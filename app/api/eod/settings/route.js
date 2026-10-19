import { route, body } from '../../../../lib/eod/http.js'
import { requireRole, createMember, publicMember, hashPassword, HttpError } from '../../../../lib/eod/auth.js'
import { db, change, audit } from '../../../../lib/eod/db.js'
import { ROLES } from '../../../../lib/eod/config.js'

export const dynamic = 'force-dynamic'

const str = (v, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

function validTimezone(tz) {
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true } catch { return false }
}

export const GET = route(async (req) => {
  requireRole(req, 'admin')
  const d = db()
  return Response.json({ settings: d.settings, members: Object.values(d.members).map(publicMember) })
})

// Settings: validated field by field; unknown keys are ignored.
export const PUT = route(async (req) => {
  const me = requireRole(req, 'admin')
  const b = (await body(req)).settings || {}
  const cur = db().settings
  const next = structuredClone(cur)
  if (b.timezone !== undefined) {
    if (!validTimezone(b.timezone)) throw new HttpError(400, 'Unknown timezone')
    next.timezone = b.timezone
  }
  if (b.workingDays !== undefined) {
    if (!Array.isArray(b.workingDays) || !b.workingDays.every((n) => Number.isInteger(n) && n >= 0 && n <= 6)) throw new HttpError(400, 'Working days must be 0-6')
    next.workingDays = [...new Set(b.workingDays)].sort()
  }
  if (b.appUrl !== undefined) {
    if (b.appUrl && !/^https:\/\/[^\s/]+/.test(b.appUrl)) throw new HttpError(400, 'The app URL must start with https://')
    next.appUrl = str(b.appUrl).replace(/\/$/, '')
  }
  if (b.sheet) {
    for (const k of ['spreadsheetId', 'spreadsheetLabel', 'sheetId', 'sheetLabel']) if (b.sheet[k] !== undefined) next.sheet[k] = str(b.sheet[k])
    if (b.sheet.columns) {
      for (const k of Object.keys(cur.sheet.columns)) if (b.sheet.columns[k] !== undefined) next.sheet.columns[k] = str(b.sheet.columns[k], 100)
      const names = Object.values(next.sheet.columns).map((x) => x.toLowerCase())
      if (names.some((x) => !x)) throw new HttpError(400, 'Every column needs a header name')
      if (new Set(names).size !== names.length) throw new HttpError(400, 'Each field needs its own column')
    }
  }
  if (b.slack) {
    for (const k of ['eodChannelId', 'eodChannelLabel', 'tlTargetId', 'tlTargetLabel']) if (b.slack[k] !== undefined) next.slack[k] = str(b.slack[k])
    if (b.slack.tlTargetType !== undefined) {
      if (!['channel', 'user'].includes(b.slack.tlTargetType)) throw new HttpError(400, 'TL target must be a channel or a user')
      next.slack.tlTargetType = b.slack.tlTargetType
    }
  }
  change((d) => { d.settings = next })
  audit(me, 'settings.updated', { keys: Object.keys(b) })
  return Response.json({ settings: next })
})

// Roster and access.
export const POST = route(async (req) => {
  const me = requireRole(req, 'admin')
  const b = await body(req)
  if (b.action === 'add_member') {
    const m = createMember({ name: b.name, email: b.email, role: b.role, password: b.password, inRoster: b.inRoster, slackUserId: str(b.slackUserId), slackLabel: str(b.slackLabel) })
    audit(me, 'member.added', { memberId: m.id, role: m.role })
    return Response.json({ member: publicMember(m) })
  }
  if (b.action === 'update_member') {
    const m = db().members[b.id]
    if (!m) throw new HttpError(404, 'No such member')
    const patch = {}
    if (b.name !== undefined) patch.name = str(b.name) || m.name
    if (b.role !== undefined) {
      if (!ROLES.includes(b.role)) throw new HttpError(400, 'Unknown role')
      if (m.id === me.id && b.role !== 'admin') throw new HttpError(400, 'You cannot remove your own admin role')
      patch.role = b.role
    }
    if (b.active !== undefined) {
      if (m.id === me.id && !b.active) throw new HttpError(400, 'You cannot deactivate yourself')
      patch.active = !!b.active
    }
    if (b.inRoster !== undefined) patch.inRoster = !!b.inRoster
    if (b.slackUserId !== undefined) { patch.slackUserId = str(b.slackUserId); patch.slackLabel = str(b.slackLabel) }
    if (b.password) {
      if (String(b.password).length < 8) throw new HttpError(400, 'Passwords need at least 8 characters')
      patch.passwordHash = hashPassword(String(b.password))
    }
    change((d) => { Object.assign(d.members[b.id], patch) })
    audit(me, 'member.updated', { memberId: m.id, fields: Object.keys(patch).map((k) => (k === 'passwordHash' ? 'password' : k)) })
    return Response.json({ member: publicMember(db().members[b.id]) })
  }
  throw new HttpError(400, 'Unknown action')
})
