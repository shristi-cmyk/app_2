'use client'
import { useEffect, useState, useCallback } from 'react'
import Script from 'next/script'

const CONNECT = {
  sheets: { name: 'Google Sheets', serviceId: 'rowqm5xi2', filteredActions: ['rowyysj8ut82', 'rowlpijbo5k1'] },
  gmail: { name: 'Gmail', serviceId: 'rowo0bqrhj5g', filteredActions: ['rowogelpy0h6'] }
}

const card = { background: '#fff', borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,.08)' }
const input = { width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ccd', boxSizing: 'border-box', font: 'inherit' }
const button = { padding: '8px 14px', borderRadius: 8, border: 0, background: '#2f5bea', color: '#fff', font: 'inherit', cursor: 'pointer' }
const ghost = { ...button, background: '#fff', color: '#1a1d21', border: '1px solid #ccd' }
const COLORS = { sdk: '#2f5bea', gtm: '#0f8a5f', none: '#8a8f98' }
const LABELS = { sdk: 'SDK', gtm: 'GTM', none: "Don't reach out" }

async function getJson(url, init) {
  const r = await fetch(url, init)
  const j = await r.json()
  if (!r.ok) throw new Error(j.error || 'Something went wrong')
  return j
}
const post = (url, body) => getJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export default function Outreach() {
  const [tab, setTab] = useState('dashboard')
  const [stats, setStats] = useState(null)
  const [message, setMessage] = useState('')
  const refresh = useCallback(() => getJson('/api/outreach/dashboard').then(setStats).catch((e) => setMessage(e.message)), [])
  useEffect(() => { refresh() }, [refresh])
  // Poll while a judging run is going.
  useEffect(() => {
    if (!stats?.job?.running) return
    const t = setInterval(refresh, 3000)
    return () => clearInterval(t)
  }, [stats?.job?.running, refresh])

  const tabs = [
    ['dashboard', 'Dashboard'],
    ['review', `Review drafts${stats ? ` (${stats.review.sdk + stats.review.gtm})` : ''}`],
    ['none', `Don't reach out${stats ? ` (${stats.none})` : ''}`],
    ['pipeline', 'Pipeline'],
    ['setup', 'Setup']
  ]
  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
      <Script src="https://flow.viasocket.com/connect.js" strategy="afterInteractive" />
      <h1 style={{ marginBottom: 4 }}>Partner Outreach</h1>
      <p style={{ marginTop: 0, color: '#555' }}>AI checks each app, picks SDK, GTM or no outreach, drafts the email for you to approve, and tracks the pipeline.</p>
      <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={tab === k ? button : ghost}>{label}</button>
        ))}
      </nav>
      {message && <p role="status" style={{ ...card, background: '#fffbe6' }} onClick={() => setMessage('')}>{message}</p>}
      {tab === 'dashboard' && <Dashboard stats={stats} refresh={refresh} setMessage={setMessage} go={setTab} />}
      {tab === 'review' && <Review refresh={refresh} setMessage={setMessage} />}
      {tab === 'none' && <NoOutreach stats={stats} refresh={refresh} setMessage={setMessage} />}
      {tab === 'pipeline' && <Pipeline setMessage={setMessage} />}
      {tab === 'setup' && <Setup refresh={refresh} setMessage={setMessage} />}
    </main>
  )
}

function Stat({ label, value, sub, color, onClick }) {
  return (
    <div onClick={onClick} style={{ ...card, marginBottom: 0, cursor: onClick ? 'pointer' : 'default', borderTop: `4px solid ${color || '#dde'}` }}>
      <div style={{ fontSize: 13, color: '#555' }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, margin: '4px 0' }}>{value ?? '–'}</div>
      {sub && <div style={{ fontSize: 13, color: '#555' }}>{sub}</div>}
    </div>
  )
}

function Bars({ rows, color }) {
  const max = Math.max(1, ...rows.map((r) => r.n))
  return rows.map((r) => (
    <div key={r.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 2fr) 3fr 48px', gap: 8, alignItems: 'center', marginBottom: 6, fontSize: 14 }}>
      <span>{r.label}</span>
      <span style={{ background: '#eef0f4', borderRadius: 4, height: 12 }}><span style={{ display: 'block', width: `${(r.n / max) * 100}%`, height: 12, borderRadius: 4, background: color }} /></span>
      <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.n}</span>
    </div>
  ))
}

function Dashboard({ stats, refresh, setMessage, go }) {
  const [limit, setLimit] = useState(25)
  if (!stats) return <p>Loading…</p>
  if (!stats.total) return <section style={card}><h2>Start here</h2><p>Connect Google Sheets and import your apps and pipeline in <a href="#" onClick={(e) => { e.preventDefault(); go('setup') }}>Setup</a>.</p></section>
  const judged = stats.total - stats.pending
  const job = stats.job
  const run = async (body) => { try { await post('/api/outreach/judge', body); refresh() } catch (e) { setMessage(e.message) } }
  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }
  return (
    <>
      <div style={grid}>
        <Stat label="Apps" value={stats.total} sub={`${judged} checked · ${stats.pending} to go`} />
        <Stat label="Pitch SDK" value={stats.sdk} sub={`${stats.review.sdk} drafts waiting`} color={COLORS.sdk} onClick={() => go('review')} />
        <Stat label="Pitch GTM" value={stats.gtm} sub={`${stats.review.gtm} drafts waiting`} color={COLORS.gtm} onClick={() => go('review')} />
        <Stat label="Don't reach out" value={stats.none} sub="see reasons" color={COLORS.none} onClick={() => go('none')} />
      </div>
      <div style={grid}>
        <Stat label="Mailed from this app" value={stats.sent.sdk + stats.sent.gtm} sub={`SDK ${stats.sent.sdk} · GTM ${stats.sent.gtm}`} color="#7a4cd9" />
        <Stat label="Mailed earlier (sheet)" value={stats.mailedBefore} sub="mail_sent in the apps sheet" />
        <Stat label="In pipeline" value={stats.pipelineTotal} sub={`${stats.followUpsDue} follow-ups due`} onClick={() => go('pipeline')} />
        <Stat label="Drafts missing an email" value={stats.noEmail} sub="add a recipient to send" />
      </div>

      <section style={card}>
        <h2 style={{ marginTop: 0 }}>Check apps with AI</h2>
        {!stats.hasKey && <p style={{ color: '#b3261e' }}>Set VIASOCKET_EMBED_SECRET on the server to run the AI check.</p>}
        <p style={{ marginTop: 0, color: '#555' }}>Clear cases (own products, enterprise giants, duplicates, already active or rejected in the pipeline) are settled by rules for free. The rest are checked one by one with viaSocket AI (1 credit per app) and an email is drafted for each SDK or GTM pick. Start small to review the quality.</p>
        {job?.running ? (
          <>
            <div style={{ background: '#eef0f4', borderRadius: 6, height: 14, marginBottom: 8 }}>
              <div style={{ width: `${((job.done + job.failed) / Math.max(1, job.total)) * 100}%`, background: COLORS.sdk, height: 14, borderRadius: 6 }} />
            </div>
            <p>Checked {job.done + job.failed} of {job.total}{job.failed ? ` · ${job.failed} failed` : ''}</p>
            <button style={{ ...button, background: '#b3261e' }} onClick={() => run({ stop: true })}>Stop</button>
          </>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>Check the next</span>
            <input type="number" min={1} max={2000} value={limit} onChange={(e) => setLimit(e.target.value)} style={{ ...input, width: 100 }} />
            <span>apps</span>
            <button style={button} disabled={!stats.pending} onClick={() => run({ limit })}>Start</button>
            {job?.finishedAt && <span style={{ color: '#555', fontSize: 14 }}>Last run: {job.done} checked{job.failed ? `, ${job.failed} failed` : ''}</span>}
          </div>
        )}
        {job?.lastError && <p style={{ color: '#b3261e', fontSize: 14 }}>Last error: {job.lastError}</p>}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <section style={card}>
          <h2 style={{ marginTop: 0 }}>Why not to reach out</h2>
          {stats.noneReasons.length ? <Bars rows={stats.noneReasons} color={COLORS.none} /> : <p style={{ color: '#555' }}>Nothing yet.</p>}
        </section>
        <section style={card}>
          <h2 style={{ marginTop: 0 }}>Pipeline by status</h2>
          <Bars rows={Object.entries(stats.pipeline).map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n)} color="#7a4cd9" />
        </section>
        <section style={card}>
          <h2 style={{ marginTop: 0 }}>Emails sent, last 14 days</h2>
          {stats.sentByDay.length ? <Bars rows={stats.sentByDay.map((r) => ({ label: r.date, n: r.n }))} color={COLORS.gtm} /> : <p style={{ color: '#555' }}>No emails sent yet.</p>}
        </section>
      </div>
    </>
  )
}

function useApps(query) {
  const [data, setData] = useState({ total: 0, items: [] })
  const load = useCallback(() => getJson('/api/outreach/apps?' + new URLSearchParams(query)).then(setData), [JSON.stringify(query)])
  useEffect(() => { load() }, [load])
  return [data, load, setData]
}

function Review({ refresh, setMessage }) {
  const [verdict, setVerdict] = useState('')
  const [data, load] = useApps({ status: 'review', ...(verdict ? { verdict } : {}), limit: 30 })
  const done = () => { load(); refresh() }
  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        {[['', 'All'], ['sdk', 'SDK'], ['gtm', 'GTM']].map(([v, l]) => <button key={v} style={verdict === v ? button : ghost} onClick={() => setVerdict(v)}>{l}</button>)}
        <span style={{ color: '#555' }}>{data.total} drafts waiting for your OK</span>
      </div>
      {!data.items.length && <p style={card}>No drafts waiting. Run the AI check from the Dashboard.</p>}
      {data.items.map((a) => <Draft key={a.id} app={a} done={done} setMessage={setMessage} />)}
    </>
  )
}

function Badge({ verdict, confidence }) {
  return (
    <span style={{ background: COLORS[verdict], color: '#fff', borderRadius: 999, padding: '2px 10px', fontSize: 13 }}>
      {LABELS[verdict]}{confidence ? ` · ${confidence} confidence` : ''}
    </span>
  )
}

function Draft({ app, done, setMessage }) {
  const w = app.work
  const [form, setForm] = useState({ to: w.to || '', subject: w.subject, body: w.body })
  const [instruction, setInstruction] = useState('')
  const [busy, setBusy] = useState('')
  useEffect(() => setForm({ to: w.to || '', subject: w.subject, body: w.body }), [w.subject, w.body, w.to])
  const dirty = form.to !== (w.to || '') || form.subject !== w.subject || form.body !== w.body
  const act = async (label, body, ok) => {
    setBusy(label)
    try { await post(`/api/outreach/apps/${app.id}`, body); setMessage(ok); done() } catch (e) { setMessage(`${app.name}: ${e.message}`) } finally { setBusy('') }
  }
  const sendNow = async () => {
    if (dirty) await post(`/api/outreach/apps/${app.id}`, { action: 'edit', ...form })
    await act('send', { action: 'send' }, `Sent to ${form.to} and added to the pipeline.`)
  }
  const other = w.verdict === 'sdk' ? 'gtm' : 'sdk'
  return (
    <section style={{ ...card, borderLeft: `4px solid ${COLORS[w.verdict]}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <h3 style={{ margin: 0 }}>{app.name} <a href={`https://${app.domain}`} target="_blank" rel="noreferrer" style={{ fontSize: 14, fontWeight: 400 }}>{app.domain}</a></h3>
        <Badge verdict={w.verdict} confidence={w.confidence} />
      </div>
      <p style={{ color: '#555', fontSize: 14, margin: '6px 0' }}>{app.category}{app.actionCount != null ? ` · ${app.actionCount} actions, ${app.triggerCount ?? 0} triggers on viaSocket` : ''}{app.mailStatus ? ` · earlier: ${app.mailStatus}` : ''}</p>
      <p style={{ margin: '6px 0 12px' }}><b>Why:</b> {w.reason}</p>
      <label style={{ display: 'block', marginBottom: 8 }}>To
        <input style={input} value={form.to} placeholder="No email in the sheet: add one" onChange={(e) => setForm({ ...form, to: e.target.value })} />
      </label>
      <label style={{ display: 'block', marginBottom: 8 }}>Subject
        <input style={input} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
      </label>
      <label style={{ display: 'block', marginBottom: 12 }}>Email
        <textarea style={{ ...input, minHeight: 200 }} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
      </label>
      <p style={{ fontWeight: 600, margin: '0 0 8px' }}>Send this one, or tell the AI what to change?</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <button style={button} disabled={!!busy || !form.to} onClick={sendNow}>{busy === 'send' ? 'Sending…' : 'Looks good, send it'}</button>
        {dirty && <button style={ghost} disabled={!!busy} onClick={() => act('edit', { action: 'edit', ...form }, 'Saved.')}>Save my edits</button>}
        <button style={ghost} disabled={!!busy} onClick={() => act('override', { action: 'override', verdict: other }, `Re-drafting ${app.name} as ${LABELS[other]} on the next AI run.`)}>Pitch {LABELS[other]} instead</button>
        <button style={ghost} disabled={!!busy} onClick={() => act('none', { action: 'override', verdict: 'none', noneReason: 'other', reason: 'Skipped by you' }, `${app.name} moved to Don't reach out.`)}>Don't reach out</button>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={input} value={instruction} placeholder="e.g. shorter, mention their Shopify app, ask for a call next week" onChange={(e) => setInstruction(e.target.value)} />
        <button style={{ ...ghost, whiteSpace: 'nowrap' }} disabled={!!busy || !instruction.trim()} onClick={() => act('revise', { action: 'revise', instruction }, `Rewrote the ${app.name} draft.`).then(() => setInstruction(''))}>{busy === 'revise' ? 'Rewriting…' : 'Ask AI to change'}</button>
      </div>
      {w.lastSendError && <p style={{ color: '#b3261e', fontSize: 14 }}>Last send failed: {w.lastSendError}</p>}
      {w.revisions?.length > 0 && <p style={{ color: '#555', fontSize: 13, marginBottom: 0 }}>Rewritten {w.revisions.length}× ({w.revisions.map((r) => r.instruction).join('; ')})</p>}
    </section>
  )
}

function NoOutreach({ stats, refresh, setMessage }) {
  const [reason, setReason] = useState('')
  const [q, setQ] = useState('')
  const [data, load] = useApps({ status: 'judged', verdict: 'none', ...(reason ? { reason } : {}), ...(q ? { q } : {}), limit: 100 })
  const override = async (a, verdict) => {
    try { await post(`/api/outreach/apps/${a.id}`, { action: 'override', verdict }); setMessage(`${a.name} queued for a ${LABELS[verdict]} draft on the next AI run.`); load(); refresh() } catch (e) { setMessage(e.message) }
  }
  return (
    <>
      <section style={card}>
        <h2 style={{ marginTop: 0 }}>{stats?.none ?? 0} apps not to reach out to</h2>
        {stats && <Bars rows={stats.noneReasons} color={COLORS.none} />}
      </section>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <select style={{ ...input, width: 'auto' }} value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">All reasons</option>
          {(stats?.noneReasons || []).map((r) => <option key={r.code} value={r.code}>{r.label} ({r.n})</option>)}
        </select>
        <input style={{ ...input, width: 240 }} placeholder="Search apps" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <section style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead><tr style={{ textAlign: 'left', background: '#f0f2f5' }}>{['App', 'Reason', 'Decided by', ''].map((h) => <th key={h} style={{ padding: 10 }}>{h}</th>)}</tr></thead>
          <tbody>
            {data.items.map((a) => (
              <tr key={a.id} style={{ borderTop: '1px solid #eee' }}>
                <td style={{ padding: 10 }}><b>{a.name}</b><br /><span style={{ color: '#555' }}>{a.domain}</span></td>
                <td style={{ padding: 10 }}>{a.work.reason}</td>
                <td style={{ padding: 10 }}>{a.work.by === 'rule' ? 'rule' : a.work.by === 'you' ? 'you' : 'AI'}</td>
                <td style={{ padding: 10, whiteSpace: 'nowrap' }}>
                  <button style={{ ...ghost, padding: '4px 8px', marginRight: 4 }} onClick={() => override(a, 'sdk')}>SDK</button>
                  <button style={{ ...ghost, padding: '4px 8px' }} onClick={() => override(a, 'gtm')}>GTM</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.total > data.items.length && <p style={{ padding: '0 10px', color: '#555' }}>Showing {data.items.length} of {data.total}. Filter or search to narrow.</p>}
      </section>
    </>
  )
}

const STATUSES = ['mail sent', 'in conversation', 'call/demo booked', 'snoozed', 'completed', 'closed', 'lost/rejected']

function Pipeline({ setMessage }) {
  const [rows, setRows] = useState([])
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const load = useCallback(() => getJson('/api/outreach/pipeline').then(setRows).catch((e) => setMessage(e.message)), [setMessage])
  useEffect(() => { load() }, [load])
  const save = async (index, patch) => {
    try { await post('/api/outreach/pipeline', { index, ...patch }); load() } catch (e) { setMessage(e.message) }
  }
  const counts = {}
  for (const r of rows) counts[r.status || 'unknown'] = (counts[r.status || 'unknown'] || 0) + 1
  const shown = rows.filter((r) => (!status || (r.status || 'unknown') === status) && (!q || `${r.partner} ${r.notes} ${r.reason}`.toLowerCase().includes(q.toLowerCase()))).reverse()
  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button style={!status ? button : ghost} onClick={() => setStatus('')}>All ({rows.length})</button>
        {Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([s, n]) => <button key={s} style={status === s ? button : ghost} onClick={() => setStatus(s)}>{s} ({n})</button>)}
        <input style={{ ...input, width: 220 }} placeholder="Search partner or notes" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <section style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead><tr style={{ textAlign: 'left', background: '#f0f2f5' }}>{['Partner', 'Team', 'Reason', 'Stage', 'Status', 'Last activity', 'Next follow-up', 'Notes'].map((h) => <th key={h} style={{ padding: 10 }}>{h}</th>)}</tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.index} style={{ borderTop: '1px solid #eee', verticalAlign: 'top' }}>
                <td style={{ padding: 10 }}><b>{r.partner}</b>{r.source === 'app' && <div style={{ fontSize: 12, color: '#7a4cd9' }}>sent from app</div>}{r.link && <div><a href={r.link} target="_blank" rel="noreferrer">link</a></div>}</td>
                <td style={{ padding: 10 }}>{r.team}</td>
                <td style={{ padding: 10 }}>{r.reason}</td>
                <td style={{ padding: 10 }}>{r.stage}</td>
                <td style={{ padding: 10 }}>
                  <select style={{ ...input, padding: 6 }} value={r.status} onChange={(e) => save(r.index, { status: e.target.value })}>
                    {[...new Set([r.status, ...STATUSES])].map((s) => <option key={s} value={s}>{s || '—'}</option>)}
                  </select>
                </td>
                <td style={{ padding: 10 }}>{r.lastActivity}</td>
                <td style={{ padding: 10 }}><input style={{ ...input, padding: 6, width: 130 }} defaultValue={r.nextFollowUp} onBlur={(e) => e.target.value !== r.nextFollowUp && save(r.index, { nextFollowUp: e.target.value })} /></td>
                <td style={{ padding: 10, minWidth: 220 }}><textarea style={{ ...input, padding: 6, minHeight: 40 }} defaultValue={r.notes} onBlur={(e) => e.target.value !== r.notes && save(r.index, { notes: e.target.value })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p style={{ padding: 10 }}>Import your pipeline sheet in Setup.</p>}
      </section>
    </>
  )
}

function Setup({ refresh, setMessage }) {
  const [settings, setSettings] = useState(null)
  const [conn, setConn] = useState(null)
  const [sources, setSources] = useState(null)
  const loadStatus = useCallback(() => getJson('/api/status').then((s) => setConn({ connected: s.connected, accounts: s.accounts || {} })).catch(() => setConn({ connected: {}, accounts: {} })), [])
  useEffect(() => {
    getJson('/api/outreach/settings').then(setSettings)
    getJson('/api/outreach/dashboard').then((d) => setSources(d.sources))
    loadStatus()
  }, [loadStatus])
  // Which app's popup is open, so the success message is stored against the right app.
  const [pending, setPending] = useState(null)
  useEffect(() => {
    const onMessage = async (event) => {
      if (event.data?.type === 'viasocket_connection_success' && pending) {
        try { await post('/api/connected', { app: pending, authId: event.data.data.id }); loadStatus() } catch (e) { setMessage(e.message) }
      } else if (event.data?.type === 'viasocket_connection_error') setMessage(event.data.error?.message || 'Connection failed')
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [pending, loadStatus, setMessage])
  const connect = async (key) => {
    try {
      const token = await fetch('/api/token').then((r) => r.text())
      setPending(key)
      window.openViasocketConnection(token, CONNECT[key].serviceId, { filteredActions: CONNECT[key].filteredActions, skipActionSelection: true })
    } catch (e) { setMessage(e.message) }
  }
  const connectButton = (key) => conn?.connected[key]
    ? <p style={{ margin: 0 }}>✓ {CONNECT[key].name} connected{conn.accounts[key] ? ` as ${conn.accounts[key]}` : ''}</p>
    : <button style={button} onClick={() => connect(key)}>Connect {CONNECT[key].name}</button>
  const field = (k, label, long) => (
    <label key={k} style={{ display: 'block', marginBottom: 12 }}>{label}
      {long ? <textarea style={{ ...input, minHeight: 80 }} value={settings[k]} onChange={(e) => setSettings({ ...settings, [k]: e.target.value })} />
        : <input style={input} value={settings[k]} onChange={(e) => setSettings({ ...settings, [k]: e.target.value })} />}
    </label>
  )
  return (
    <>
      <section style={card}>
        <h2 style={{ marginTop: 0 }}>1. Bring in your Google Sheets</h2>
        <div style={{ marginBottom: 16 }}>{connectButton('sheets')}</div>
        {conn?.connected.sheets && sources && (
          <>
            <SheetSource kind="apps" title="Apps list" source={sources.apps} refresh={refresh} setMessage={setMessage} />
            <SheetSource kind="pipeline" title="Pipeline" source={sources.pipeline} refresh={refresh} setMessage={setMessage} />
            <p style={{ color: '#555', fontSize: 14, marginBottom: 0 }}>Import again any time to pick up changes in the sheet. Your verdicts and drafts are kept.</p>
          </>
        )}
      </section>
      <section style={card}>
        <h2 style={{ marginTop: 0 }}>2. Connect Gmail</h2>
        {connectButton('gmail')}
      </section>
      {settings && (
        <section style={card}>
          <h2 style={{ marginTop: 0 }}>3. What the AI should know</h2>
          {field('senderName', 'Your name (email sign-off and sender name)')}
          {field('senderTitle', 'Your title')}
          {field('team', 'Team name for new pipeline rows')}
          {field('company', 'About viaSocket', true)}
          {field('sdkPitch', 'The SDK pitch', true)}
          {field('sdkLink', 'SDK link to include')}
          {field('gtmPitch', 'The GTM pitch', true)}
          {field('guidelines', 'Email style', true)}
          <label style={{ display: 'block', marginBottom: 12 }}>How hard the AI thinks
            <select style={input} value={settings.effort} onChange={(e) => setSettings({ ...settings, effort: e.target.value })}>
              {['low', 'medium', 'high'].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <button style={button} onClick={() => post('/api/outreach/settings', settings).then(() => setMessage('Saved. New drafts use these settings.')).catch((e) => setMessage(e.message))}>Save</button>
        </section>
      )}
    </>
  )
}

function SheetSource({ kind, title, source, refresh, setMessage }) {
  const [spreadsheets, setSpreadsheets] = useState([])
  const [tabs, setTabs] = useState([])
  const [pick, setPick] = useState({ spreadsheetId: source.spreadsheetId, sheetId: source.sheetId })
  const [done, setDone] = useState(source.importedAt ? source : null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { getJson('/api/options?kind=spreadsheets').then(setSpreadsheets).catch((e) => setMessage(e.message)) }, [setMessage])
  useEffect(() => {
    setTabs([])
    if (pick.spreadsheetId) getJson('/api/options?kind=tabs&spreadsheet=' + encodeURIComponent(pick.spreadsheetId)).then(setTabs).catch((e) => setMessage(e.message))
  }, [pick.spreadsheetId, setMessage])
  const labelOf = (list, v) => (list.find((o) => o.value === v) || {}).label || ''
  // The saved choice may not be in the first page of the picker; keep it selectable.
  const sheetOptions = spreadsheets.some((o) => o.value === pick.spreadsheetId) || !pick.spreadsheetId ? spreadsheets
    : [{ value: pick.spreadsheetId, label: source.spreadsheetId === pick.spreadsheetId ? source.label.split(' · ')[0] : pick.spreadsheetId }, ...spreadsheets]
  const run = async () => {
    setBusy(true)
    setMessage(`Reading ${title.toLowerCase()} from Google Sheets…`)
    try {
      const label = `${labelOf(sheetOptions, pick.spreadsheetId)} · ${labelOf(tabs, pick.sheetId)}`
      const r = await post('/api/outreach/import', { kind, ...pick, label })
      setMessage(kind === 'apps' ? `Imported ${r.total} apps (${r.added} new).` : `Imported ${r.total} pipeline rows.`)
      setDone({ importedAt: new Date().toISOString() })
      refresh()
    } catch (e) { setMessage(e.message) } finally { setBusy(false) }
  }
  const select = { ...input, marginBottom: 8 }
  return (
    <div style={{ borderTop: '1px solid #eee', padding: '12px 0' }}>
      <b>{title}</b>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginTop: 8 }}>
        <select style={select} value={pick.spreadsheetId} onChange={(e) => setPick({ spreadsheetId: e.target.value, sheetId: '' })}>
          <option value="">Choose a spreadsheet…</option>
          {sheetOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select style={select} value={pick.sheetId} onChange={(e) => setPick({ ...pick, sheetId: e.target.value })} disabled={!tabs.length}>
          <option value="">Choose a tab…</option>
          {tabs.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <button style={button} disabled={busy || !pick.spreadsheetId || !pick.sheetId} onClick={run}>{busy ? 'Importing…' : done ? 'Import again' : 'Import'}</button>
      {done?.importedAt && <span style={{ marginLeft: 10, color: '#555', fontSize: 14 }}>Last imported {new Date(done.importedAt).toLocaleString()}</span>}
    </div>
  )
}
