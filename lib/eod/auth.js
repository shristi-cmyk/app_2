import crypto from 'node:crypto'
import { db, change, audit } from './db.js'
import { ROLES } from './config.js'

// The EOD tool has its own sign-in, separate from the site's APP_PASSWORD: employees get an account
// that reaches only their own entries, never the owner-level tools.

const COOKIE = 'eod_session'
const SESSION_DAYS = 14

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function sessionSecret() {
  const s = process.env.EOD_SESSION_SECRET
  if (!s || s.length < 16) throw new HttpError(503, 'Set EOD_SESSION_SECRET (16+ characters) to use the EOD tool.')
  return s
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('base64url')
  const hash = crypto.scryptSync(password, salt, 32).toString('base64url')
  return `scrypt$${salt}$${hash}`
}

export function verifyPassword(password, stored) {
  if (!stored || !password) return false
  const [, salt, hash] = stored.split('$')
  const actual = crypto.scryptSync(password, salt, 32)
  const expected = Buffer.from(hash, 'base64url')
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

const sign = (data) => crypto.createHmac('sha256', sessionSecret()).update(data).digest('base64url')

export function sessionCookie(memberId) {
  const payload = Buffer.from(JSON.stringify({ uid: memberId, exp: Date.now() + SESSION_DAYS * 864e5 })).toString('base64url')
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${COOKIE}=${payload}.${sign(payload)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`
}

export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`

function readCookie(req) {
  const raw = (req.headers.get('cookie') || '').split(/;\s*/).find((c) => c.startsWith(COOKIE + '='))
  return raw ? raw.slice(COOKIE.length + 1) : null
}

export function currentMember(req) {
  const value = readCookie(req)
  if (!value) return null
  const [payload, sig] = value.split('.')
  const expected = sign(payload)
  if (!sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  let data
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString()) } catch { return null }
  if (!data.uid || data.exp < Date.now()) return null
  const m = db().members[data.uid]
  return m && m.active ? m : null
}

// Admin can do everything a TL can; a TL can do everything an employee can.
const RANK = { employee: 1, tl: 2, admin: 3 }
export const can = (member, role) => !!member && RANK[member.role] >= RANK[role]

export function requireRole(req, role = 'employee') {
  const m = currentMember(req)
  if (!m) throw new HttpError(401, 'Please sign in.')
  if (!can(m, role)) throw new HttpError(403, 'You do not have access to this.')
  return m
}

// What the browser may see of a member: never the password hash.
export const publicMember = (m) => m && {
  id: m.id, name: m.name, email: m.email, role: m.role, active: m.active,
  inRoster: m.inRoster, slackUserId: m.slackUserId || '', slackLabel: m.slackLabel || ''
}

const attempts = new Map()
function throttle(email) {
  const now = Date.now()
  const list = (attempts.get(email) || []).filter((t) => now - t < 60_000)
  if (list.length >= 5) throw new HttpError(429, 'Too many attempts. Wait a minute and try again.')
  list.push(now)
  attempts.set(email, list)
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''))
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

export function login(emailRaw, password) {
  const email = String(emailRaw || '').trim().toLowerCase()
  if (!email || !password) throw new HttpError(400, 'Enter your email and password.')
  throttle(email)
  const members = Object.values(db().members)
  let m = members.find((x) => x.email === email)
  // First run: the admin named in the environment signs in once and becomes the first admin account.
  if (!m && !members.some((x) => x.role === 'admin') && process.env.EOD_ADMIN_EMAIL && process.env.EOD_ADMIN_PASSWORD &&
      email === process.env.EOD_ADMIN_EMAIL.trim().toLowerCase() && safeEqual(password, process.env.EOD_ADMIN_PASSWORD)) {
    m = createMember({ name: 'Admin', email, role: 'admin', password, inRoster: false })
    audit(m, 'member.bootstrap_admin', { memberId: m.id })
  }
  if (!m || !m.active || !verifyPassword(password, m.passwordHash)) throw new HttpError(401, 'Wrong email or password.')
  attempts.delete(email)
  return m
}

export function createMember({ name, email, role, password, inRoster, slackUserId, slackLabel }) {
  email = String(email || '').trim().toLowerCase()
  name = String(name || '').trim()
  if (!name || !/^[^@\s]+@[^@\s]+$/.test(email)) throw new HttpError(400, 'A name and a valid email are required.')
  if (!ROLES.includes(role)) throw new HttpError(400, 'Unknown role.')
  if (!password || String(password).length < 8) throw new HttpError(400, 'Passwords need at least 8 characters.')
  if (Object.values(db().members).some((x) => x.email === email)) throw new HttpError(409, 'A member with that email already exists.')
  const id = 'm_' + crypto.randomBytes(6).toString('hex')
  const member = {
    id, name, email, role, active: true,
    inRoster: inRoster ?? role === 'employee',
    slackUserId: slackUserId || '', slackLabel: slackLabel || '',
    passwordHash: hashPassword(String(password)),
    createdAt: new Date().toISOString()
  }
  change((d) => { d.members[id] = member })
  return member
}
