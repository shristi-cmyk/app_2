'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import Script from 'next/script'
import { Shell, card, button, ghost, muted, Badge, getJson, post, Notice } from '../ui.js'

export default function Integrations() {
  return <Shell path="/eod/integrations" role="admin" title="Integrations">{() => <Page />}</Shell>
}

function Page() {
  const [status, setStatus] = useState(null)
  const [notice, setNotice] = useState('')
  const pending = useRef(null)
  const load = useCallback(() => getJson('/api/eod/integrations?view=status').then(setStatus).catch((e) => setNotice(e.message)), [])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    const onMessage = async (event) => {
      const type = event.data?.type
      if (type === 'viasocket_connection_success' && pending.current) {
        try {
          // The server checks this auth_id against the workspace's real connections before storing it.
          await post('/api/eod/integrations', { app: pending.current, authId: event.data.data.id })
          setNotice('Connected.')
        } catch (e) { setNotice(e.message) }
        load()
      } else if (type === 'viasocket_connection_error') {
        setNotice(event.data.error?.message || 'Connection failed')
      }
      // viasocket_connection_closed: nothing was created; a success can still follow.
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [load])

  // The token is fetched before the click, so the popup opens from the click itself (no popup blocker).
  const [token, setToken] = useState('')
  useEffect(() => { getJson('/api/eod/integrations?view=token').then((j) => setToken(j.token)).catch((e) => setNotice(e.message)) }, [])

  function connect(key, app) {
    if (!window.openViasocketConnection || !token) return setNotice('The connect script is still loading. Try again in a moment.')
    pending.current = key
    const options = { filteredActions: app.filteredActions, skipActionSelection: true }
    if (app.state === 'expired' && app.authId) options.authId = app.authId
    window.openViasocketConnection(token, app.serviceId, options)
  }

  return (
    <>
      <Script id="viasocket-connect-script" src="https://flow.viasocket.com/connect.js" strategy="afterInteractive" />
      <Notice message={notice} onClose={() => setNotice('')} />
      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Company connections</h3>
        <p style={muted}>Connect once for the whole team. Employees never sign in to Slack or Google; the app acts through these connections. Status is read live from viaSocket.</p>
        {!status ? <p>Loading…</p> : Object.entries(status).map(([key, app]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid #f0f1f3', flexWrap: 'wrap' }}>
            <img src={app.icon} alt="" width={24} height={24} />
            <strong style={{ minWidth: 120 }}>{app.name}</strong>
            <Badge value={app.state} />
            <span style={muted}>{app.account}{app.error ? ` · ${app.error}` : ''}</span>
            <span style={{ flex: 1 }} />
            <button style={app.state === 'connected' ? ghost : button} onClick={() => connect(key, app)}>
              <img src={app.icon} alt="" width={16} height={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              {app.state === 'connected' ? `Reconnect ${app.name}` : app.state === 'expired' ? `Sign in to ${app.name} again` : `Connect ${app.name}`}
            </button>
          </div>
        ))}
      </section>
      <PrebuiltUi token={token} setNotice={setNotice} />
    </>
  )
}

// viaSocket's prebuilt UI in a box of this page: the company's connected apps and every flow, including the
// EOD event flows (open them from the Automation page to edit one).
function PrebuiltUi({ token, setNotice }) {
  const [loaded, setLoaded] = useState(false)
  const embedRef = useRef(null)
  useEffect(() => { if (window.viaSocket?.mount) setLoaded(true) }, [])
  useEffect(() => {
    if (!loaded || !token || embedRef.current) return
    embedRef.current = window.viaSocket.mount({ embedToken: token, parent: '#eod-viasocket-embed', config: { pageheading: 'Automation', showEnabled: false } })
    embedRef.current.on?.('error', (e) => setNotice(`viaSocket: ${e?.message || 'the integrations view reported an error'}`))
    return () => { embedRef.current?.destroy?.(); embedRef.current = null }
  }, [loaded, token, setNotice])
  return (
    <section style={card}>
      <Script src="https://embed.viasocket.com/prod-embedcomponent.js" strategy="afterInteractive" onLoad={() => setLoaded(true)} />
      <h3 style={{ marginTop: 0 }}>viaSocket</h3>
      <p style={muted}>Browse viaSocket's apps and build extra automations for the team. The four EOD events and their history are on the Automation page; the Slack and Google Sheets connections above are managed here, not in this box.</p>
      <div id="eod-viasocket-embed" style={{ height: 640, border: '1px solid #e3e5e8', borderRadius: 8 }} />
    </section>
  )
}
