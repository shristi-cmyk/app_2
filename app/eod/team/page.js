'use client'
import { useEffect, useState, useCallback } from 'react'
import { Shell, card, input, button, ghost, muted, table, th, td, Badge, getJson, post, Notice, List, Picker, fmtTime } from '../ui.js'

export default function Team() {
  return <Shell path="/eod/team" role="tl">{() => <Dashboard />}</Shell>
}

const iso = (d) => d.toISOString().slice(0, 10)
const daysAgo = (n) => iso(new Date(Date.now() - n * 864e5))

function Dashboard() {
  const [notice, setNotice] = useState('')
  const [roster, setRoster] = useState([])
  useEffect(() => { getJson('/api/eod/team?view=roster').then((j) => setRoster(j.members)).catch((e) => setNotice(e.message)) }, [])
  return (
    <>
      <Notice message={notice} onClose={() => setNotice('')} />
      <Today setNotice={setNotice} />
      <Brief roster={roster} setNotice={setNotice} />
      <History roster={roster} setNotice={setNotice} />
    </>
  )
}

function Today({ setNotice }) {
  const [date, setDate] = useState('')
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback((d) => getJson('/api/eod/team?view=status' + (d ? '&date=' + d : '')).then((s) => { setStatus(s); setDate(s.date) }).catch((e) => setNotice(e.message)), [setNotice])
  useEffect(() => { load() }, [load])
  async function check() {
    setBusy(true)
    try {
      const r = await post('/api/eod/team', { action: 'missing_check', date })
      setNotice(r.skipped ? `${r.date}: ${r.skipped}.` : `${r.date}: ${r.missing.length} missing. Reminders: ${r.missing.map((m) => `${m.name} (${m.reminder.replace(/_/g, ' ')})`).join(', ') || 'none needed'}.`)
      load(date)
    } catch (e) { setNotice(e.message) }
    setBusy(false)
  }
  const counts = status ? status.members.reduce((a, m) => ({ ...a, [m.status]: (a[m.status] || 0) + 1 }), {}) : {}
  return (
    <section style={card}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Team status</h2>
        <input type="date" style={{ ...input, width: 170 }} value={date} onChange={(e) => { setDate(e.target.value); load(e.target.value) }} />
        <button style={ghost} onClick={check} disabled={busy}>{busy ? 'Checking…' : 'Run missing check & DM reminders'}</button>
      </div>
      {!status ? <p>Loading…</p> : (
        <>
          {status.sheetError && <p style={{ color: '#b3261e' }}>Could not read the sheet: {status.sheetError}</p>}
          {!status.workingDay && <p style={muted}>Not a working day.</p>}
          <p style={muted}>{Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(' · ') || 'No one on the roster yet.'}</p>
          <table style={table}><thead><tr><th style={th}>Employee</th><th style={th}>Status</th><th style={th}>Sheet row</th><th style={th}>Reminder</th></tr></thead>
            <tbody>{status.members.map((m) => (
              <tr key={m.id}><td style={td}>{m.name}</td><td style={td}><Badge value={m.status} /></td><td style={td}>{m.sheetRowId || '—'}</td>
                <td style={td}>{m.reminder ? <><Badge value={m.reminder.status} /> <span style={muted}>{fmtTime(m.reminder.at)}</span></> : '—'}</td></tr>
            ))}</tbody></table>
        </>
      )}
    </section>
  )
}

function Brief({ roster, setNotice }) {
  const [q, setQ] = useState({ employeeId: '', from: daysAgo(30), to: iso(new Date()), question: '' })
  const [month, setMonth] = useState(iso(new Date()).slice(0, 7))
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState('')
  async function ask(e) {
    e?.preventDefault()
    setBusy('brief')
    try { setResult(await post('/api/eod/team', { action: 'brief', ...q })) } catch (err) { setNotice(err.message) }
    setBusy('')
  }
  async function rollup() {
    setBusy('rollup')
    try {
      const r = await post('/api/eod/team', { action: 'rollup', month })
      setResult(r)
      setNotice(r.slack?.ts ? 'Rollup posted to the TL review channel.' : `Rollup ready; Slack post failed: ${r.slack?.error || 'unknown'}`)
    } catch (err) { setNotice(err.message) }
    setBusy('')
  }
  return (
    <section style={card}>
      <h2 style={{ marginTop: 0 }}>Ask for a summary</h2>
      <p style={muted}>An evidence brief from the logged entries: consistency, recurring themes, recurring or unresolved blockers, and gaps. It never gives a rating or score — that decision is yours.</p>
      <form onSubmit={ask}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <Picker label="Who" value={q.employeeId} placeholder="Whole team" options={roster.map((m) => ({ value: m.id, label: m.name }))} onChange={(v) => setQ({ ...q, employeeId: v })} />
          <label>From<input type="date" style={input} value={q.from} onChange={(e) => setQ({ ...q, from: e.target.value })} /></label>
          <label>To<input type="date" style={input} value={q.to} onChange={(e) => setQ({ ...q, to: e.target.value })} /></label>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={input} placeholder="Optional question, e.g. which blockers keep coming back?" value={q.question} onChange={(e) => setQ({ ...q, question: e.target.value })} />
          <button style={button} type="submit" disabled={!!busy}>{busy === 'brief' ? 'Writing…' : 'Get brief'}</button>
        </div>
      </form>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
        <span style={muted}>Monthly rollup for the team:</span>
        <input type="month" style={{ ...input, width: 170 }} value={month} onChange={(e) => setMonth(e.target.value)} />
        <button style={ghost} onClick={rollup} disabled={!!busy}>{busy === 'rollup' ? 'Generating…' : 'Generate & post to TL channel'}</button>
      </div>
      {result && <BriefView r={result} />}
    </section>
  )
}

function Cites({ rows }) {
  return rows?.length ? <span style={muted}> (rows {rows.join(', ')})</span> : null
}

function BriefView({ r }) {
  return (
    <div style={{ borderTop: '1px solid #e3e5e8', marginTop: 16, paddingTop: 12 }}>
      <p style={muted}>{r.scope === 'team' ? 'Team' : r.consistency[0]?.employee_name} · {r.from} to {r.to} · {r.entriesConsidered} entries from the sheet{r.truncated ? ' (latest 400 sent to AI)' : ''}{r.removed ? ` · ${r.removed} evaluative statement(s) removed` : ''}</p>
      {r.answer && <p><strong>Answer:</strong> {r.answer}</p>}
      <h3>Consistency</h3>
      <table style={table}><thead><tr><th style={th}>Employee</th><th style={th}>Days logged</th><th style={th}>Working days</th><th style={th}>Missing dates</th></tr></thead>
        <tbody>{r.consistency.map((c) => <tr key={c.employee_id}><td style={td}>{c.employee_name}</td><td style={td}>{c.days_logged}</td><td style={td}>{c.working_days}</td><td style={td}>{c.missing_dates.join(', ') || '—'}</td></tr>)}</tbody></table>
      {[['Recurring themes', r.themes], ['Recurring / unresolved blockers', r.blockers], ['Gaps', r.gaps]].map(([h, list]) => (
        <div key={h}><h3>{h}</h3>{list?.length ? <ul>{list.map((x, i) => <li key={i}>{x.text}{x.unresolved ? <strong> — still open</strong> : null}<Cites rows={x.rows} /></li>)}</ul> : <p style={muted}>None found.</p>}</div>
      ))}
      <p style={muted}>Row ids are sheet tab:row — open the EOD sheet to see the source entry. Event: {r.event?.status?.replace(/_/g, ' ') || '—'}</p>
    </div>
  )
}

function History({ roster, setNotice }) {
  const [f, setF] = useState({ employeeId: '', from: daysAgo(14), to: iso(new Date()) })
  const [rows, setRows] = useState(null)
  async function load(e) {
    e?.preventDefault()
    try { setRows((await getJson(`/api/eod/team?view=history&employeeId=${f.employeeId}&from=${f.from}&to=${f.to}`)).rows) } catch (err) { setNotice(err.message) }
  }
  return (
    <section style={card}>
      <h2 style={{ marginTop: 0 }}>History</h2>
      <form onSubmit={load} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, alignItems: 'end' }}>
        <Picker label="Who" value={f.employeeId} placeholder="Whole team" options={roster.map((m) => ({ value: m.id, label: m.name }))} onChange={(v) => setF({ ...f, employeeId: v })} />
        <label>From<input type="date" style={input} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
        <label>To<input type="date" style={input} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
        <button style={{ ...button, marginBottom: 12 }} type="submit">Show</button>
      </form>
      {rows && (rows.length === 0 ? <p style={muted}>No logged entries in this range.</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={table}><thead><tr><th style={th}>Date</th><th style={th}>Employee</th><th style={th}>Done</th><th style={th}>Blockers</th><th style={th}>Plan</th><th style={th}>Status</th><th style={th}>Row</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.sheetRowId}><td style={td}>{r.date}</td><td style={td}>{r.employee}</td><td style={td}><List items={r.done} /></td><td style={td}><List items={r.blockers} /></td><td style={td}><List items={r.plan} /></td><td style={td}><Badge value={r.status} /></td><td style={td}>{r.sheetRowId}</td></tr>)}</tbody></table>
        </div>
      ))}
    </section>
  )
}
