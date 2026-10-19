'use client'
import { useEffect, useState, useCallback } from 'react'
import { Shell, card, input, button, ghost, muted, Badge, getJson, post, Notice, List, fmtTime } from '../ui.js'

export default function Review() {
  return <Shell path="/eod/review" role="tl" title="Needs review">{() => <Queue />}</Shell>
}

function Queue() {
  const [entries, setEntries] = useState(null)
  const [notes, setNotes] = useState({})
  const [notice, setNotice] = useState('')
  const load = useCallback(() => getJson('/api/eod/review').then((j) => setEntries(j.entries)).catch((e) => setNotice(e.message)), [])
  useEffect(() => { load() }, [load])
  async function act(body, ok) {
    try { await post('/api/eod/review', body); setNotice(ok); load() } catch (e) { setNotice(e.message) }
  }
  return (
    <>
      <Notice message={notice} onClose={() => setNotice('')} />
      <p style={muted}>Entries that look incomplete or contradictory, and entries whose sheet or Slack step failed. The entry stays exactly as the employee confirmed it; resolving only records that you looked.</p>
      {!entries ? <p>Loading…</p> : entries.length === 0 ? <p style={card}>Nothing needs review.</p> : entries.map((e) => (
        <section key={e.id} style={card}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <strong>{e.employee}</strong><span>{e.date}</span><Badge value={e.status} /><span style={muted}>row {e.sheet?.sheetRowId || '—'} · {fmtTime(e.submittedAt)}</span>
          </div>
          {e.flags?.length > 0 && <ul style={{ color: '#c2410c' }}>{e.flags.map((f) => <li key={f.code}>{f.message}</li>)}</ul>}
          {e.errors && Object.entries(e.errors).map(([k, v]) => <p key={k} style={{ color: '#b3261e' }}>{k === 'sheet' ? 'Google Sheet' : 'Slack'} failed: {v}</p>)}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {[['Done', 'done'], ['Blockers', 'blockers'], ['Plan', 'plan']].map(([l, k]) => <div key={k}><strong>{l}</strong><List items={e.fields?.[k]} /></div>)}
          </div>
          {e.message && <details style={{ marginTop: 8 }}><summary style={muted}>Employee's original message</summary><p style={{ whiteSpace: 'pre-wrap' }}>{e.message}</p></details>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {e.status === 'Flagged' && <>
              <input style={input} placeholder="Note (optional)" value={notes[e.id] || ''} onChange={(ev) => setNotes({ ...notes, [e.id]: ev.target.value })} />
              <button style={button} onClick={() => act({ entryId: e.id, note: notes[e.id] }, 'Marked as reviewed.')}>Mark reviewed</button>
            </>}
            {e.errors && Object.keys(e.errors).length > 0 && <button style={ghost} onClick={() => act({ action: 'retry', entryId: e.id }, 'Retried.')}>Retry failed step</button>}
          </div>
        </section>
      ))}
    </>
  )
}
