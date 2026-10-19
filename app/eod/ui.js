'use client'
import { useEffect, useState, useCallback } from 'react'

// Same look as the other tools on this site.
export const card = { background: '#fff', borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,.08)' }
export const input = { width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ccd', boxSizing: 'border-box', font: 'inherit' }
export const button = { padding: '8px 14px', borderRadius: 8, border: 0, background: '#2f5bea', color: '#fff', font: 'inherit', cursor: 'pointer' }
export const ghost = { ...button, background: '#fff', color: '#1a1d21', border: '1px solid #ccd' }
export const danger = { ...button, background: '#b3261e' }
export const muted = { color: '#555', fontSize: 13 }
export const table = { width: '100%', borderCollapse: 'collapse', fontSize: 14 }
export const th = { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #e3e5e8', color: '#555', fontWeight: 600 }
export const td = { padding: '6px 8px', borderBottom: '1px solid #f0f1f3', verticalAlign: 'top' }

const STATUS_COLORS = {
  Draft: '#8a8f98', Confirmed: '#b07d00', Logged: '#0f8a5f', Flagged: '#c2410c', Missing: '#b3261e', 'Not submitted': '#8a8f98',
  connected: '#0f8a5f', active: '#0f8a5f', delivered: '#0f8a5f', sent: '#0f8a5f', success: '#0f8a5f',
  expired: '#c2410c', incomplete: '#b07d00', paused: '#b07d00', not_active: '#b07d00', sending: '#b07d00',
  not_connected: '#8a8f98', not_set_up: '#8a8f98', not_configured: '#8a8f98', no_slack_user: '#8a8f98',
  missing: '#b3261e', error: '#b3261e', failed: '#b3261e', deleted: '#b3261e', unknown: '#b3261e'
}
export function Badge({ value, label }) {
  const c = STATUS_COLORS[value] || '#555'
  return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600, color: c, background: c + '1a', whiteSpace: 'nowrap' }}>{label || String(value).replace(/_/g, ' ')}</span>
}

export async function getJson(url, init) {
  const r = await fetch(url, init)
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || 'Something went wrong')
  return j
}
export const post = (url, body, method = 'POST') => getJson(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString() : '')

const TABS = [
  ['/eod', 'My EOD', 'employee'],
  ['/eod/team', 'Team', 'tl'],
  ['/eod/review', 'Review', 'tl'],
  ['/eod/integrations', 'Integrations', 'admin'],
  ['/eod/automation', 'Automation', 'admin'],
  ['/eod/settings', 'Settings', 'admin']
]
const RANK = { employee: 1, tl: 2, admin: 3 }
export const can = (m, role) => !!m && RANK[m.role] >= RANK[role]

function Login({ onDone }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  async function submit(e) {
    e.preventDefault()
    setError('')
    try { onDone((await post('/api/eod/auth', { action: 'login', email, password })).member) } catch (err) { setError(err.message) }
  }
  return (
    <form onSubmit={submit} style={{ ...card, maxWidth: 380, margin: '40px auto' }}>
      <h2 style={{ marginTop: 0 }}>Sign in to EOD Reports</h2>
      <label style={{ display: 'block', marginBottom: 12 }}>Email<input style={input} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label style={{ display: 'block', marginBottom: 12 }}>Password<input style={input} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <button style={button} type="submit">Sign in</button>
      {error && <p role="alert" style={{ color: '#b3261e' }}>{error}</p>}
    </form>
  )
}

// Every EOD page: signs the person in, shows the tabs their role allows, and renders the page for them.
export function Shell({ path, role = 'employee', title, children }) {
  const [member, setMember] = useState(undefined)
  const [error, setError] = useState('')
  const load = useCallback(() => getJson('/api/eod/auth').then((j) => setMember(j.member)).catch((e) => { setError(e.message); setMember(null) }), [])
  useEffect(() => { load() }, [load])
  async function logout() {
    await post('/api/eod/auth', { action: 'logout' }).catch(() => {})
    setMember(null)
  }
  if (member === undefined) return <main style={{ padding: 24 }}>Loading…</main>
  if (!member) return <main style={{ padding: 16 }}>{error && <p style={{ ...card, background: '#fffbe6' }}>{error}</p>}<Login onDone={setMember} /></main>
  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ marginBottom: 4 }}>EOD Reports</h1>
        <span style={muted}>{member.name} · {member.role.toUpperCase()} · <a href="#" onClick={(e) => { e.preventDefault(); logout() }}>Sign out</a></span>
      </div>
      <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0 16px' }}>
        {TABS.filter(([, , r]) => can(member, r)).map(([href, label]) => (
          <a key={href} href={href} style={{ ...(href === path ? button : ghost), textDecoration: 'none' }}>{label}</a>
        ))}
      </nav>
      {title && <h2 style={{ marginTop: 0 }}>{title}</h2>}
      {can(member, role) ? children(member) : <p style={card}>You do not have access to this page.</p>}
    </main>
  )
}

export function Notice({ message, onClose }) {
  if (!message) return null
  return <p role="status" onClick={onClose} style={{ ...card, background: '#fffbe6', cursor: 'pointer' }}>{message}</p>
}

// One list per line: what the employee sees and edits before confirming.
export const toLines = (items) => (items || []).join('\n')
export const fromLines = (text) => text.split('\n').map((x) => x.trim()).filter(Boolean)

export function Picker({ label, value, options, onChange, disabled, placeholder = 'Choose…' }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      {label}
      <select style={input} value={value || ''} onChange={(e) => onChange(e.target.value, (options || []).find((o) => o.value === e.target.value)?.label || '')} disabled={disabled}>
        <option value="">{placeholder}</option>
        {(options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

export function List({ items }) {
  if (!items?.length) return <span style={muted}>—</span>
  return <ul style={{ margin: 0, paddingLeft: 18 }}>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
}
