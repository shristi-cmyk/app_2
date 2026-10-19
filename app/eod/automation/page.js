'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import Script from 'next/script'
import { Shell, card, input, button, ghost, muted, table, th, td, Badge, getJson, post, Notice, fmtTime } from '../ui.js'

const STATE_LABEL = { not_set_up: 'Not set up', incomplete: 'Incomplete', active: 'Active', paused: 'Paused', deleted: 'Deleted', error: 'Error' }

export default function Automation() {
  return <Shell path="/eod/automation" role="admin" title="Automation">{() => <Page />}</Shell>
}

function Page() {
  const [data, setData] = useState(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const [builder, setBuilder] = useState(null) // the event whose flow is open in the builder
  const load = useCallback(() => getJson('/api/eod/automation').then(setData).catch((e) => setNotice(e.message)), [])
  useEffect(() => { load() }, [load])

  async function act(body, label) {
    setBusy(label)
    try {
      const r = await post('/api/eod/automation', body)
      if (body.action === 'test') setNotice(`Test event: ${r.delivery.status.replace(/_/g, ' ')}${r.delivery.lastError ? ` — ${r.delivery.lastError}` : ''}. Check the runs below.`)
      await load()
      return r
    } catch (e) { setNotice(e.message) } finally { setBusy('') }
  }

  async function openBuilder(ev) {
    let flowId = ev.flowId
    if (!flowId || ev.state === 'deleted') flowId = (await act({ action: 'setup', event: ev.key }, 'setup:' + ev.key))?.flowId
    if (flowId) setBuilder({ ...ev, flowId })
  }

  return (
    <>
      <Notice message={notice} onClose={() => setNotice('')} />
      <p style={muted}>Each product event runs a viaSocket flow. Set one up, then open it in the builder to add what should happen (for example post to another channel or update a CRM), mapping fields from the sample payload. An event is shown as Active only when viaSocket reports the flow published with at least one step.</p>
      {!data ? <p>Loading…</p> : data.events.map((ev) => (
        <section key={ev.key} style={card}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>{ev.label}</h3>
            <Badge value={ev.state} label={STATE_LABEL[ev.state]} />
            {ev.steps && <span style={muted}>steps: {ev.steps.join(' → ') || 'none'}</span>}
          </div>
          <p style={muted}>{ev.description}</p>
          {ev.error && <p style={{ color: '#b3261e' }}>{ev.error}</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {(ev.state === 'not_set_up' || ev.state === 'deleted') && <button style={button} disabled={!!busy} onClick={() => act({ action: 'setup', event: ev.key }, 'setup:' + ev.key)}>{busy === 'setup:' + ev.key ? 'Setting up…' : 'Set up flow'}</button>}
            {ev.flowId && ev.state !== 'deleted' && <button style={ghost} onClick={() => openBuilder(ev)}>Open in builder</button>}
            {ev.flowId && <button style={ghost} disabled={!!busy} onClick={() => act({ action: 'test', event: ev.key }, 'test:' + ev.key)}>{busy === 'test:' + ev.key ? 'Sending…' : 'Send test event'}</button>}
            {ev.state === 'active' && <button style={ghost} disabled={!!busy} onClick={() => act({ action: 'pause', event: ev.key }, 'pause')}>Pause</button>}
            {ev.state === 'paused' && <button style={ghost} disabled={!!busy} onClick={() => act({ action: 'resume', event: ev.key }, 'resume')}>Resume</button>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            <details>
              <summary>Sample payload (for field mapping and tests only)</summary>
              <pre style={{ background: '#f6f7f9', padding: 12, borderRadius: 8, overflowX: 'auto', fontSize: 12 }}>{JSON.stringify(ev.sample, null, 2)}</pre>
            </details>
            <div>
              <div style={muted}>Fields this flow's steps read: {ev.payloadFields?.length ? ev.payloadFields.join(', ') : 'none yet'} <span>(the builder offers every sample field for mapping)</span></div>
              <div style={muted}>Last delivery: {ev.lastDelivery ? <><Badge value={ev.lastDelivery.status} /> {fmtTime(ev.lastDelivery.updatedAt)} {ev.lastDelivery.isTest ? '(test)' : ''} {ev.lastDelivery.lastError}</> : '—'}</div>
              <div style={muted}>Recent runs on viaSocket: {ev.runsError ? ev.runsError : ev.runs?.length ? ev.runs.map((r, i) => <span key={i} style={{ marginRight: 6 }}><Badge value={r.status} /> {fmtTime(r.createdAt)}</span>) : 'none'}</div>
            </div>
          </div>
        </section>
      ))}
      {builder && <Builder ev={builder} onClose={() => { setBuilder(null); load() }} onChange={() => act({ action: 'sync', event: builder.key }, 'sync')} setNotice={setNotice} />}
      {data && <Schedule data={data} act={act} busy={busy} />}
      {data && <Deliveries list={data.deliveries} act={act} />}
    </>
  )
}

// The prebuilt UI opened on one event's flow, with the sample as dummy_payload so the field mapper offers its fields.
function Builder({ ev, onClose, onChange, setNotice }) {
  const [token, setToken] = useState('')
  const [loaded, setLoaded] = useState(false)
  const embedRef = useRef(null)
  const changed = useRef(onChange)
  changed.current = onChange
  useEffect(() => { if (window.viaSocket?.mount) setLoaded(true) }, [])
  useEffect(() => { getJson('/api/eod/integrations?view=token').then((j) => setToken(j.token)).catch((e) => setNotice(e.message)) }, [setNotice])
  useEffect(() => {
    if (!loaded || !token) return
    const onFlow = (flow) => {
      if (!flow?.id || flow.id !== ev.flowId) return
      // We never trust the URL from the browser: the server re-reads this flow from viaSocket.
      if (['published', 'updated', 'paused', 'deleted'].includes(flow.action)) changed.current()
    }
    embedRef.current = window.viaSocket.mount({
      embedToken: token,
      parent: '#eod-flow-builder',
      config: { showEnabled: false, pageheading: 'Automation' },
      open: { flowId: ev.flowId, dummy_payload: ev.sample, meta: ev.key }
    })
    // The typed listener: flow events from this component only.
    embedRef.current.on('flow', onFlow)
    return () => { embedRef.current?.destroy?.(); embedRef.current = null }
  }, [loaded, token, ev])
  return (
    <section style={{ ...card, borderLeft: '4px solid #2f5bea' }}>
      <Script src="https://embed.viasocket.com/prod-embedcomponent.js" strategy="afterInteractive" onLoad={() => setLoaded(true)} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Builder · {ev.label}</h3>
        <button style={ghost} onClick={onClose}>Close</button>
      </div>
      <p style={muted}>Keep the first step ("received"); add your steps after it. Publish to save.</p>
      <div id="eod-flow-builder" style={{ height: 680, border: '1px solid #e3e5e8', borderRadius: 8 }} />
    </section>
  )
}

function Schedule({ data, act, busy }) {
  const [cron, setCron] = useState(data.settings.reminderCron)
  const [appUrl, setAppUrl] = useState(data.settings.appUrl || (typeof window !== 'undefined' ? window.location.origin : ''))
  const s = data.schedule
  return (
    <section style={card}>
      <h3 style={{ marginTop: 0 }}>End-of-day missing check</h3>
      <p style={muted}>A viaSocket schedule calls this app at the time below; the app finds who hasn't logged and DMs each of them privately on Slack (once per day), then sends the EOD Entry Missing event. Days that are not working days are skipped.</p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <Badge value={s.state} label={s.state === 'active' ? 'Active' : s.state.replace(/_/g, ' ')} />
        {s.understoodAs && <span style={muted}>viaSocket runs it: {s.understoodAs}</span>}
        {s.error && <span style={{ color: '#b3261e' }}>{s.error}</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 8, alignItems: 'end' }}>
        <label>Schedule (cron or words)<input style={input} value={cron} onChange={(e) => setCron(e.target.value)} placeholder="0 19 * * 1-5" /></label>
        <label>This app's public URL<input style={input} value={appUrl} onChange={(e) => setAppUrl(e.target.value)} placeholder="https://…" /></label>
        <button style={button} disabled={!!busy} onClick={() => act({ action: 'schedule', cron, appUrl }, 'schedule')}>{busy === 'schedule' ? 'Saving…' : 'Save schedule'}</button>
      </div>
    </section>
  )
}

function Deliveries({ list, act }) {
  return (
    <section style={card}>
      <h3 style={{ marginTop: 0 }}>Recent deliveries</h3>
      {!list.length ? <p style={muted}>No events sent yet.</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={table}><thead><tr><th style={th}>When</th><th style={th}>Event</th><th style={th}>Id</th><th style={th}>Status</th><th style={th}>Attempts</th><th style={th}>Error</th><th style={th} /></tr></thead>
            <tbody>{list.map((d) => (
              <tr key={d.eventId}><td style={td}>{fmtTime(d.updatedAt)}</td><td style={td}>{d.event}{d.isTest ? ' (test)' : ''}</td><td style={{ ...td, fontSize: 12 }}>{d.eventId}</td><td style={td}><Badge value={d.status} /></td><td style={td}>{d.attempts}</td><td style={{ ...td, fontSize: 12 }}>{d.lastError}</td>
                <td style={td}>{d.status !== 'delivered' && d.status !== 'sending' && <button style={ghost} onClick={() => act({ action: 'retry', eventId: d.eventId }, 'retry')}>Retry</button>}</td></tr>
            ))}</tbody></table>
        </div>
      )}
    </section>
  )
}
