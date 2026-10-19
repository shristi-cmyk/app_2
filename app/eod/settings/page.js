'use client'
import { useEffect, useState, useCallback } from 'react'
import { Shell, card, input, button, ghost, muted, table, th, td, Badge, getJson, post, Notice, Picker, fmtTime } from '../ui.js'

export default function Settings() {
  return <Shell path="/eod/settings" role="admin" title="Settings">{(me) => <Page me={me} />}</Shell>
}

const COLUMN_LABELS = { entryId: 'Entry ID', date: 'Date', employee: 'Employee', done: 'Done', blockers: 'Blockers', plan: 'Plan', submittedAt: 'Submitted At' }
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const opts = (path) => getJson('/api/eod/integrations?view=options&' + path)

function Page({ me }) {
  const [data, setData] = useState(null)
  const [notice, setNotice] = useState('')
  const load = useCallback(() => getJson('/api/eod/settings').then(setData).catch((e) => setNotice(e.message)), [])
  useEffect(() => { load() }, [load])
  async function save(settings, ok = 'Saved.') {
    try { await post('/api/eod/settings', { settings }, 'PUT'); setNotice(ok); load() } catch (e) { setNotice(e.message) }
  }
  if (!data) return <><Notice message={notice} onClose={() => setNotice('')} /><p>Loading…</p></>
  return (
    <>
      <Notice message={notice} onClose={() => setNotice('')} />
      <SheetSettings s={data.settings.sheet} save={save} setNotice={setNotice} />
      <SlackSettings s={data.settings.slack} save={save} setNotice={setNotice} />
      <General s={data.settings} save={save} />
      <Roster members={data.members} me={me} reload={load} setNotice={setNotice} />
      <Audit />
    </>
  )
}

function SheetSettings({ s, save, setNotice }) {
  const [f, setF] = useState(s)
  const [sheets, setSheets] = useState([])
  const [tabs, setTabs] = useState([])
  const [headers, setHeaders] = useState([])
  const [q, setQ] = useState('')
  useEffect(() => { opts('kind=spreadsheets').then(setSheets).catch((e) => setNotice(`Google Sheets: ${e.message}`)) }, [setNotice])
  useEffect(() => {
    setTabs([])
    if (f.spreadsheetId) opts('kind=tabs&spreadsheet=' + encodeURIComponent(f.spreadsheetId)).then(setTabs).catch((e) => setNotice(e.message))
  }, [f.spreadsheetId, setNotice])
  useEffect(() => {
    setHeaders([])
    if (f.spreadsheetId && f.sheetId) opts(`kind=headers&spreadsheet=${encodeURIComponent(f.spreadsheetId)}&tab=${encodeURIComponent(f.sheetId)}`).then((list) => setHeaders(list.map((h) => h.value))).catch((e) => setNotice(e.message))
  }, [f.spreadsheetId, f.sheetId, setNotice])
  async function search(e) {
    e.preventDefault()
    try { setSheets(await opts('kind=spreadsheets&q=' + encodeURIComponent(q))) } catch (err) { setNotice(err.message) }
  }
  const setCol = (k, v) => setF({ ...f, columns: { ...f.columns, [k]: v } })
  return (
    <section style={card}>
      <h3 style={{ marginTop: 0 }}>EOD log sheet</h3>
      <p style={muted}>The Google Sheet is the record of every logged entry. Pick the spreadsheet and tab, then match each field to a column header. If the tab is empty, the first entry creates these headers.</p>
      <form onSubmit={search} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input style={input} placeholder="Search spreadsheets" value={q} onChange={(e) => setQ(e.target.value)} /><button style={ghost} type="submit">Search</button>
      </form>
      <Picker label="Spreadsheet" value={f.spreadsheetId} options={sheets} onChange={(v, l) => setF({ ...f, spreadsheetId: v, spreadsheetLabel: l, sheetId: '', sheetLabel: '' })} />
      <Picker label="Tab" value={f.sheetId} options={tabs} disabled={!f.spreadsheetId} onChange={(v, l) => setF({ ...f, sheetId: v, sheetLabel: l })} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        {Object.entries(COLUMN_LABELS).map(([k, label]) => (
          <label key={k}>{label} column
            {headers.length ? (
              <select style={input} value={f.columns[k]} onChange={(e) => setCol(k, e.target.value)}>
                {!headers.includes(f.columns[k]) && <option value={f.columns[k]}>{f.columns[k]} (new)</option>}
                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            ) : <input style={input} value={f.columns[k]} onChange={(e) => setCol(k, e.target.value)} />}
          </label>
        ))}
      </div>
      <p style={muted}>Current: {s.spreadsheetLabel ? `${s.spreadsheetLabel} › ${s.sheetLabel}` : 'not set'}</p>
      <button style={button} onClick={() => save({ sheet: f })}>Save sheet settings</button>
    </section>
  )
}

function SlackSettings({ s, save, setNotice }) {
  const [f, setF] = useState(s)
  const [channels, setChannels] = useState([])
  const [users, setUsers] = useState([])
  useEffect(() => {
    opts('kind=channels').then(setChannels).catch((e) => setNotice(`Slack: ${e.message}`))
    opts('kind=users').then(setUsers).catch(() => {})
  }, [setNotice])
  return (
    <section style={card}>
      <h3 style={{ marginTop: 0 }}>Slack</h3>
      <Picker label="EOD channel (every confirmed entry is posted here, and only here)" value={f.eodChannelId} options={channels} onChange={(v, l) => setF({ ...f, eodChannelId: v, eodChannelLabel: l })} />
      <label style={{ display: 'block', marginBottom: 12 }}>TL review goes to
        <select style={input} value={f.tlTargetType} onChange={(e) => setF({ ...f, tlTargetType: e.target.value, tlTargetId: '', tlTargetLabel: '' })}>
          <option value="channel">a private channel</option><option value="user">a direct message</option>
        </select>
      </label>
      <Picker label={f.tlTargetType === 'user' ? 'TL to DM' : 'TL review channel'} value={f.tlTargetId} options={f.tlTargetType === 'user' ? users : channels} onChange={(v, l) => setF({ ...f, tlTargetId: v, tlTargetLabel: l })} />
      <p style={muted}>Missing-report reminders are always private DMs to each employee.</p>
      <button style={button} onClick={() => save({ slack: f })}>Save Slack settings</button>
    </section>
  )
}

function General({ s, save }) {
  const [f, setF] = useState({ timezone: s.timezone, workingDays: s.workingDays, appUrl: s.appUrl })
  const toggle = (d) => setF({ ...f, workingDays: f.workingDays.includes(d) ? f.workingDays.filter((x) => x !== d) : [...f.workingDays, d] })
  return (
    <section style={card}>
      <h3 style={{ marginTop: 0 }}>Team calendar</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <label>Timezone<input style={input} value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} placeholder="Asia/Kolkata" /></label>
        <label>App URL (used in reminder links)<input style={input} value={f.appUrl} onChange={(e) => setF({ ...f, appUrl: e.target.value })} placeholder="https://…" /></label>
      </div>
      <div style={{ margin: '12px 0' }}>Working days: {DAYS.map((d, i) => (
        <label key={d} style={{ marginRight: 10 }}><input type="checkbox" checked={f.workingDays.includes(i)} onChange={() => toggle(i)} /> {d}</label>
      ))}</div>
      <button style={button} onClick={() => save(f)}>Save</button>
    </section>
  )
}

function Roster({ members, me, reload, setNotice }) {
  const blank = { name: '', email: '', role: 'employee', password: '', slackUserId: '', slackLabel: '' }
  const [n, setN] = useState(blank)
  const [users, setUsers] = useState([])
  useEffect(() => { opts('kind=users').then(setUsers).catch(() => {}) }, [])
  async function call(body, ok) {
    try { await post('/api/eod/settings', body); setNotice(ok); reload() } catch (e) { setNotice(e.message) }
  }
  async function add(e) {
    e.preventDefault()
    await call({ action: 'add_member', ...n }, `Added ${n.name}. Share their email and password with them privately.`)
    setN(blank)
  }
  return (
    <section style={card}>
      <h3 style={{ marginTop: 0 }}>Team roster and access</h3>
      <p style={muted}>Employees submit and see only their own entries. TLs see the team. Admins configure. "On roster" members are expected to post an EOD every working day.</p>
      <div style={{ overflowX: 'auto' }}>
        <table style={table}><thead><tr><th style={th}>Name</th><th style={th}>Email</th><th style={th}>Role</th><th style={th}>On roster</th><th style={th}>Slack user (for reminders)</th><th style={th}>Status</th><th style={th} /></tr></thead>
          <tbody>{members.map((m) => (
            <tr key={m.id}>
              <td style={td}>{m.name}</td><td style={td}>{m.email}</td>
              <td style={td}><select value={m.role} onChange={(e) => call({ action: 'update_member', id: m.id, role: e.target.value }, 'Role updated.')} disabled={m.id === me.id}><option value="employee">employee</option><option value="tl">tl</option><option value="admin">admin</option></select></td>
              <td style={td}><input type="checkbox" checked={!!m.inRoster} onChange={(e) => call({ action: 'update_member', id: m.id, inRoster: e.target.checked }, 'Updated.')} /></td>
              <td style={td}><select value={m.slackUserId} onChange={(e) => call({ action: 'update_member', id: m.id, slackUserId: e.target.value, slackLabel: e.target.selectedOptions[0]?.text || '' }, 'Slack user saved.')}>
                <option value="">—</option>{m.slackUserId && !users.some((u) => u.value === m.slackUserId) && <option value={m.slackUserId}>{m.slackLabel || m.slackUserId}</option>}
                {users.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}</select></td>
              <td style={td}><Badge value={m.active ? 'active' : 'deleted'} label={m.active ? 'active' : 'inactive'} /></td>
              <td style={td}>
                {m.id !== me.id && <button style={ghost} onClick={() => call({ action: 'update_member', id: m.id, active: !m.active }, 'Updated.')}>{m.active ? 'Deactivate' : 'Activate'}</button>}{' '}
                <button style={ghost} onClick={() => { const p = window.prompt(`New password for ${m.name} (8+ characters)`); if (p) call({ action: 'update_member', id: m.id, password: p }, 'Password changed.') }}>Set password</button>
              </td>
            </tr>
          ))}</tbody></table>
      </div>
      <form onSubmit={add} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginTop: 16, alignItems: 'end' }}>
        <label>Name<input style={input} value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} /></label>
        <label>Email<input style={input} type="email" value={n.email} onChange={(e) => setN({ ...n, email: e.target.value })} /></label>
        <label>Role<select style={input} value={n.role} onChange={(e) => setN({ ...n, role: e.target.value })}><option value="employee">employee</option><option value="tl">tl</option><option value="admin">admin</option></select></label>
        <label>Initial password<input style={input} type="password" autoComplete="new-password" value={n.password} onChange={(e) => setN({ ...n, password: e.target.value })} /></label>
        <Picker label="Slack user" value={n.slackUserId} options={users} onChange={(v, l) => setN({ ...n, slackUserId: v, slackLabel: l })} />
        <button style={{ ...button, marginBottom: 12 }} type="submit">Add member</button>
      </form>
    </section>
  )
}

function Audit() {
  const [rows, setRows] = useState(null)
  return (
    <section style={card}>
      <h3 style={{ marginTop: 0 }}>Audit trail</h3>
      {!rows ? <button style={ghost} onClick={() => getJson('/api/eod/audit').then((j) => setRows(j.audit))}>Show recent activity</button> : (
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          <table style={table}><thead><tr><th style={th}>When</th><th style={th}>Who</th><th style={th}>Action</th><th style={th}>Details</th></tr></thead>
            <tbody>{rows.map((r, i) => {
              const { at, actor, action, ...rest } = r
              return <tr key={i}><td style={td}>{fmtTime(at)}</td><td style={td}>{actor?.name || actor?.id}</td><td style={td}>{action}</td><td style={{ ...td, fontSize: 12 }}>{JSON.stringify(rest)}</td></tr>
            })}</tbody></table>
        </div>
      )}
    </section>
  )
}
