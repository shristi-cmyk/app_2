'use client'
import { useEffect, useState, useCallback } from 'react'
import { usePathname } from 'next/navigation'

// Base styles. States (hover, focus, press) and motion live in eod.css.
export const card = { background: '#fff', borderRadius: 16, padding: 22, marginBottom: 18, boxShadow: '0 1px 3px rgba(17,24,39,.06), 0 1px 2px rgba(17,24,39,.04)', border: '1px solid #eef0f5' }
export const input = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #d6d9e3', boxSizing: 'border-box', font: 'inherit', background: '#fff', color: '#111827' }
export const button = { padding: '9px 16px', borderRadius: 10, border: 0, background: '#4f46e5', color: '#fff', font: 'inherit', fontWeight: 600, cursor: 'pointer' }
export const ghost = { ...button, background: '#fff', color: '#1f2937', border: '1px solid #d6d9e3', fontWeight: 500 }
export const danger = { ...button, background: '#d03b3b' }
export const muted = { color: '#6b7280', fontSize: 13 }
export const table = { width: '100%', borderCollapse: 'collapse', fontSize: 14 }
export const th = { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.04em' }
export const td = { padding: '10px', borderBottom: '1px solid #f1f2f6', verticalAlign: 'top' }

// Status colors are reserved for state and always come with a glyph and a label, never color alone.
const GOOD = '#0ca30c', WARN = '#b77a00', SERIOUS = '#d4622f', CRIT = '#d03b3b', IDLE = '#6b7280'
const STATUS = {
  Logged: [GOOD, '✓'], connected: [GOOD, '✓'], active: [GOOD, '✓'], delivered: [GOOD, '✓'], sent: [GOOD, '✓'], success: [GOOD, '✓'],
  Draft: [IDLE, '✎'], 'Not submitted': [IDLE, '○'], not_connected: [IDLE, '○'], not_set_up: [IDLE, '○'], not_configured: [IDLE, '○'], no_slack_user: [IDLE, '○'],
  Confirmed: [WARN, '…'], incomplete: [WARN, '!'], paused: [WARN, '‖'], not_active: [WARN, '‖'], sending: [WARN, '…'],
  Flagged: [SERIOUS, '⚑'], expired: [SERIOUS, '!'],
  Missing: [CRIT, '✕'], missing: [CRIT, '✕'], error: [CRIT, '✕'], failed: [CRIT, '✕'], deleted: [CRIT, '✕'], unknown: [CRIT, '?']
}
export function Badge({ value, label }) {
  const [c, glyph] = STATUS[value] || [IDLE, '•']
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px 3px 7px', borderRadius: 999, fontSize: 12, fontWeight: 600, color: '#1f2937', background: c + '14', border: `1px solid ${c}33`, whiteSpace: 'nowrap' }}>
      <span aria-hidden style={{ color: c, fontSize: 11 }}>{glyph}</span>{label || String(value).replace(/_/g, ' ')}
    </span>
  )
}

export async function getJson(url, init) {
  const r = await fetch(url, init)
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || 'Something went wrong')
  return j
}
export const post = (url, body, method = 'POST') => getJson(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString() : '')

// Small line icons (24px grid, currentColor).
const PATHS = {
  chat: 'M4 5h16v10H8l-4 4z',
  team: 'M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3zM8 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm0 2c-2.7 0-6 1.3-6 3.5V19h12v-2.5C14 14.3 10.7 13 8 13zm8 0c-.4 0-.8 0-1.2.1A4.6 4.6 0 0 1 16 16.5V19h6v-2.5c0-2.2-3.3-3.5-6-3.5z',
  flag: 'M5 21V4h11l-1.5 4L16 12H7v9z',
  plug: 'M9 2v5M15 2v5M7 7h10v4a5 5 0 0 1-10 0zM12 16v6',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8.6-3a6.9 6.9 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L15.7 3h-3.9l-.4 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a6.9 6.9 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2l.4 2.6h3.9l.4-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
  doc: 'M6 2h9l5 5v15H6zM14 2v6h6M9 13h8M9 17h8'
}
export function Icon({ name, size = 18 }) {
  return <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"><path d={PATHS[name]} /></svg>
}

const AVATAR_COLORS = ['#4f46e5', '#0e7490', '#7c3aed', '#be185d', '#047857', '#b45309', '#1d4ed8']
export function Avatar({ name = '?' }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?'
  const color = AVATAR_COLORS[[...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AVATAR_COLORS.length]
  return <span className="eod-avatar" style={{ background: color }} aria-hidden>{initials}</span>
}

export function Skeleton({ lines = 3, height = 14 }) {
  return (
    <div aria-busy="true" aria-label="Loading" style={{ display: 'grid', gap: 10 }}>
      {Array.from({ length: lines }, (_, i) => <div key={i} className="eod-skel" style={{ height, width: `${100 - (i % 3) * 18}%` }} />)}
    </div>
  )
}

const TABS = [
  ['/eod', 'My EOD', 'employee', 'chat'],
  ['/eod/team', 'Team', 'tl', 'team'],
  ['/eod/review', 'Review', 'tl', 'flag'],
  ['/eod/integrations', 'Integrations', 'admin', 'plug'],
  ['/eod/automation', 'Automation', 'admin', 'bolt'],
  ['/eod/settings', 'Settings', 'admin', 'gear']
]
const RANK = { employee: 1, tl: 2, admin: 3 }
export const can = (m, role) => !!m && RANK[m.role] >= RANK[role]

function Hero({ member, onLogout }) {
  return (
    <header className="eod-hero">
      <div className="eod-hero-inner">
        <div className="eod-brand">
          <span className="eod-logo"><Icon name="doc" size={22} /></span>
          <div><h1>EOD Reports</h1><p>Daily updates in, evidence out. Ratings stay with people.</p></div>
        </div>
        {member && (
          <div className="eod-user">
            <Avatar name={member.name} />
            <div style={{ lineHeight: 1.2 }}><div style={{ fontWeight: 600 }}>{member.name}</div><div className="eod-role">{member.role}</div></div>
            <button onClick={onLogout}>Sign out</button>
          </div>
        )}
      </div>
    </header>
  )
}

function Login({ onDone }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try { onDone((await post('/api/eod/auth', { action: 'login', email, password })).member) } catch (err) { setError(err.message) }
    setBusy(false)
  }
  return (
    <form onSubmit={submit} style={{ ...card, maxWidth: 400, margin: '0 auto', padding: 28 }}>
      <h2 style={{ marginTop: 0, marginBottom: 4 }}>Welcome back</h2>
      <p style={{ ...muted, marginTop: 0, marginBottom: 20 }}>Sign in with the email and password your admin gave you.</p>
      <label style={{ display: 'block', marginBottom: 14, fontSize: 14, fontWeight: 500 }}>Email<input style={{ ...input, marginTop: 6 }} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label style={{ display: 'block', marginBottom: 18, fontSize: 14, fontWeight: 500 }}>Password<input style={{ ...input, marginTop: 6 }} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <button style={{ ...button, width: '100%', padding: '11px 16px' }} type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      {error && <p role="alert" style={{ color: '#d03b3b', marginBottom: 0 }}>{error}</p>}
    </form>
  )
}

// Every EOD page: signs the person in, shows the tabs their role allows, and renders the page for them.
export function Shell({ path, role = 'employee', title, children }) {
  const [member, setMember] = useState(undefined)
  const [error, setError] = useState('')
  const current = usePathname() || path
  const load = useCallback(() => getJson('/api/eod/auth').then((j) => setMember(j.member)).catch((e) => { setError(e.message); setMember(null) }), [])
  useEffect(() => { load() }, [load])
  async function logout() {
    await post('/api/eod/auth', { action: 'logout' }).catch(() => {})
    setMember(null)
  }
  return (
    <>
      <Hero member={member} onLogout={logout} />
      <main className="eod-main">
        {member === undefined ? <div style={card}><Skeleton lines={4} /></div>
          : !member ? <>{error && <Notice message={error} onClose={() => setError('')} />}<Login onDone={setMember} /></>
          : (
            <>
              <nav className="eod-tabs" aria-label="EOD sections">
                {TABS.filter(([, , r]) => can(member, r)).map(([href, label, , icon]) => (
                  <a key={href} href={href} className="eod-tab" aria-current={href === current ? 'page' : undefined}><Icon name={icon} size={16} />{label}</a>
                ))}
              </nav>
              {title && <h2 style={{ margin: '0 0 14px', fontSize: 22 }}>{title}</h2>}
              {can(member, role) ? children(member) : <p style={card}>You do not have access to this page.</p>}
            </>
          )}
      </main>
    </>
  )
}

// A toast in the corner. Errors stay until dismissed; other messages fade after a few seconds.
export function Notice({ message, onClose }) {
  const kind = /fail|error|could not|not |unavailable|denied|invalid|wrong/i.test(message || '') ? 'error' : /sent|saved|added|logged|connected|updated|changed|marked|retried/i.test(message || '') ? 'ok' : 'info'
  useEffect(() => {
    if (!message || kind === 'error') return
    const t = setTimeout(onClose, 6000)
    return () => clearTimeout(t)
  }, [message, kind, onClose])
  if (!message) return null
  return (
    <div className="eod-toasts" role="status" aria-live="polite">
      <div className="eod-toast" data-kind={kind} onClick={onClose} title="Dismiss">
        <span aria-hidden>{kind === 'error' ? '✕' : kind === 'ok' ? '✓' : 'ℹ'}</span><span style={{ flex: 1 }}>{message}</span>
      </div>
    </div>
  )
}

// One list per line: what the employee sees and edits before confirming.
export const toLines = (items) => (items || []).join('\n')
export const fromLines = (text) => text.split('\n').map((x) => x.trim()).filter(Boolean)

export function Picker({ label, value, options, onChange, disabled, placeholder = 'Choose…' }) {
  return (
    <label style={{ display: 'block', marginBottom: 12, fontSize: 14, fontWeight: 500 }}>
      {label}
      <select style={{ ...input, marginTop: 6 }} value={value || ''} onChange={(e) => onChange(e.target.value, (options || []).find((o) => o.value === e.target.value)?.label || '')} disabled={disabled}>
        <option value="">{placeholder}</option>
        {(options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

export function List({ items }) {
  if (!items?.length) return <span style={muted}>—</span>
  return <ul style={{ margin: 0, paddingLeft: 18 }}>{items.map((x, i) => <li key={i} style={{ marginBottom: 2 }}>{x}</li>)}</ul>
}
