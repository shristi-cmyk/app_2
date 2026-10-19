'use client'
import { useEffect, useState, useCallback } from 'react'
import Script from 'next/script'

const APPS = [
  { key: 'sheets', serviceId: 'rowqm5xi2',
    name: 'Google Sheets', 
    filteredActions: ['rowyysj8ut82'],
    icon: 'https://stuff.thingsofbrand.com/google.com/images/img4_googlesheet.png' },
  { key: 'docs', serviceId: 'row14rstzmzo',
    name: 'Google Docs', 
    filteredActions: ['rowlwzex2g2b'],
    icon: 'https://stuff.thingsofbrand.com/google.com/images/imgc_Google_Docs.png' },
  { key: 'gmail', serviceId: 'rowo0bqrhj5g',
    name: 'Gmail', 
    filteredActions: ['rowogelpy0h6'],
    icon: 'https://stuff.thingsofbrand.com/gmail.com/images/imge_idrA5FDGTH_1763454052978.svg' }
]

const card = { background: '#fff', borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,.08)' }
const input = { width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ccd', boxSizing: 'border-box', font: 'inherit' }
const button = { padding: '10px 16px', borderRadius: 8, border: 0, background: '#2f5bea', color: '#fff', font: 'inherit', cursor: 'pointer' }

async function getJson(url, init) {
  const r = await fetch(url, init)
  const j = await r.json()
  if (!r.ok) throw new Error(j.error || 'Something went wrong')
  return j
}

export default function Home() {
  const [status, setStatus] = useState({ connected: {}, active: null })
  const [message, setMessage] = useState('')
  const [spreadsheets, setSpreadsheets] = useState([])
  const [tabs, setTabs] = useState([])
  const [templates, setTemplates] = useState([])
  const [form, setForm] = useState({
    spreadsheetId: '', sheetId: '', templateId: '',
    subject: 'Invoice {{invoice_no}}',
    body: 'Hi {{buyer_name}},\n\nPlease find invoice {{invoice_no}} for {{amount}} attached.\n\nThank you!'
  })
  const [testTo, setTestTo] = useState('')

  const refresh = useCallback(() => getJson('/api/status').then(setStatus).catch((e) => setMessage(e.message)), [])
  useEffect(() => { refresh() }, [refresh])

  const allConnected = APPS.every((a) => status.connected[a.key])

  useEffect(() => {
    if (!allConnected) return
    getJson('/api/options?kind=spreadsheets').then(setSpreadsheets).catch((e) => setMessage(e.message))
    getJson('/api/options?kind=templates').then(setTemplates).catch((e) => setMessage(e.message))
  }, [allConnected])

  useEffect(() => {
    setTabs([])
    if (!form.spreadsheetId) return
    getJson('/api/options?kind=tabs&spreadsheet=' + encodeURIComponent(form.spreadsheetId)).then(setTabs).catch((e) => setMessage(e.message))
  }, [form.spreadsheetId])

  // Which app's popup is open, so the success message is stored against the right app.
  const [pending, setPending] = useState(null)
  useEffect(() => {
    const onMessage = async (event) => {
      if (event.data?.type === 'viasocket_connection_success' && pending) {
        try {
          await getJson('/api/connected', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ app: pending, authId: event.data.data.id }) })
          setMessage('')
          refresh()
        } catch (e) { setMessage(e.message) }
      } else if (event.data?.type === 'viasocket_connection_error') {
        setMessage(event.data.error?.message || 'Connection failed')
      }
      // viasocket_connection_closed: nothing was created; leave the button as it was.
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [pending, refresh])

  async function connect(app) {
    try {
      const token = await fetch('/api/token').then((r) => r.text())
      setPending(app.key)
      window.openViasocketConnection(token, app.serviceId, { filteredActions: app.filteredActions, skipActionSelection: true })
    } catch (e) { setMessage(e.message) }
  }

  async function save() {
    setMessage('Saving…')
    try {
      await getJson('/api/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, labels: { spreadsheet: labelOf(spreadsheets, form.spreadsheetId), tab: labelOf(tabs, form.sheetId), template: labelOf(templates, form.templateId) } }) })
      setMessage('Saved. New rows in the sheet will now be emailed as PDF invoices.')
      refresh()
    } catch (e) { setMessage(e.message) }
  }

  async function post(url, body, okText) {
    setMessage('Working…')
    try {
      await getJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
      setMessage(okText); refresh()
    } catch (e) { setMessage(e.message) }
  }

  const labelOf = (list, v) => (list.find((o) => o.value === v) || {}).label || ''
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const select = (label, key, options, disabled) => (
    <label style={{ display: 'block', marginBottom: 12 }}>
      {label}
      <select style={input} value={form[key]} onChange={set(key)} disabled={disabled}>
        <option value="">Choose…</option>
        {(options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: 24 }}>
      <Script src="https://flow.viasocket.com/connect.js" strategy="afterInteractive" />
      <h1>Invoice Mailer</h1>
      <p>When a new row is added to your Google Sheet, a PDF invoice is made from your Google Doc template and emailed to the buyer.</p>

      <section style={card}>
        <h2>1. Connect your Google apps</h2>
        {APPS.map((a) => (
          <button key={a.key} onClick={() => connect(a)} disabled={status.connected[a.key]}
            style={{ ...button, background: status.connected[a.key] ? '#2e8b57' : '#fff', color: status.connected[a.key] ? '#fff' : '#1a1d21', border: '1px solid #ccd', marginRight: 8, marginBottom: 8, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <img src={a.icon} alt="" width={20} height={20} />
            {status.connected[a.key] ? `${a.name} connected${status.accounts?.[a.key] ? ' · ' + status.accounts[a.key] : ''}` : `Connect ${a.name}`}
          </button>
        ))}
      </section>

      {status.active && (
        <section style={{ ...card, borderLeft: '4px solid #2e8b57' }}>
          <h2>Running now</h2>
          <table style={{ borderCollapse: 'collapse' }}><tbody>
            {[
              ['Watching sheet', status.active.labels?.spreadsheet || status.active.spreadsheetId],
              ['Tab', status.active.labels?.tab || status.active.sheetId],
              ['Invoice template', status.active.labels?.template || status.active.templateId],
              ['Sent from', status.accounts?.gmail || 'your Gmail'],
              ['Email subject', status.active.subject],
              ['Started', status.active.createdAt && new Date(status.active.createdAt).toLocaleString()]
            ].map(([k, v]) => (
              <tr key={k}><td style={{ padding: '4px 16px 4px 0', color: '#555', verticalAlign: 'top' }}>{k}</td><td style={{ padding: '4px 0' }}>{v}</td></tr>
            ))}
          </tbody></table>
          <p style={{ fontSize: 13, color: '#555', marginBottom: 0 }}>Each new row is emailed to the address in its <code>buyer_email</code> column.</p>
        </section>
      )}

      <section style={{ ...card, opacity: allConnected ? 1 : 0.5 }}>
        <h2>2. Choose your sheet and template</h2>
        {select('Google Sheet', 'spreadsheetId', spreadsheets, !allConnected)}
        {select('Tab', 'sheetId', tabs, !form.spreadsheetId)}
        {select('Invoice template (Google Doc)', 'templateId', templates, !allConnected)}
        <label style={{ display: 'block', marginBottom: 12 }}>Email subject
          <input style={input} value={form.subject} onChange={set('subject')} />
        </label>
        <label style={{ display: 'block', marginBottom: 12 }}>Email message
          <textarea style={{ ...input, minHeight: 110 }} value={form.body} onChange={set('body')} />
        </label>
        <p style={{ fontSize: 13, color: '#555' }}>You can use {'{{buyer_name}}, {{invoice_no}}, {{amount}}, {{date}}'} in the subject and message.</p>
        <button style={button} onClick={save} disabled={!allConnected}>Save and start</button>
        {status.active && <button style={{ ...button, background: '#b3261e', marginLeft: 8 }} onClick={() => post('/api/stop', {}, 'Stopped. No more invoices will be sent.')}>Stop</button>}
      </section>

      {status.active && (
        <section style={card}>
          <h2>3. Send a test</h2>
          <p>Sends a sample invoice (TEST-001) to an email you choose, so you can check the PDF and message.</p>
          <input style={{ ...input, marginBottom: 12 }} placeholder="you@example.com" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
          <button style={button} onClick={() => post('/api/test', { to: testTo }, 'Test invoice sent. Check your inbox.')}>Send test invoice</button>
        </section>
      )}

      {message && <p role="status" style={{ ...card, background: '#fffbe6' }}>{message}</p>}
    </main>
  )
}
