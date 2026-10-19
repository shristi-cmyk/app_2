'use client'
import { useEffect, useState, useCallback } from 'react'
import { Shell, card, input, button, ghost, muted, table, th, td, Badge, getJson, post, toLines, fromLines, Notice, fmtTime, List } from './ui.js'

export default function EmployeeChat() {
  return <Shell path="/eod">{(me) => <Chat me={me} />}</Shell>
}

const FIELDS = [['done', 'Done today'], ['blockers', 'Blockers'], ['plan', 'Plan for tomorrow']]

function Chat({ me }) {
  const [history, setHistory] = useState(null)
  const [entry, setEntry] = useState(null)
  const [edit, setEdit] = useState({ done: '', blockers: '', plan: '' })
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [thread, setThread] = useState([])

  const load = useCallback(() => getJson('/api/eod/entries').then((h) => {
    setHistory(h)
    if (h.today) {
      setEntry(h.today)
      const f = h.today.fields || h.today.draft
      if (f) setEdit({ done: toLines(f.done), blockers: toLines(f.blockers), plan: toLines(f.plan) })
    }
  }).catch((e) => setNotice(e.message)), [])
  useEffect(() => { load() }, [load])

  const say = (who, text) => setThread((t) => [...t, { who, text }])

  async function send(e) {
    e.preventDefault()
    if (!message.trim()) return
    say('you', message)
    setBusy('draft')
    try {
      const { entry } = await post('/api/eod/entries', { action: 'draft', message })
      setEntry(entry)
      setEdit({ done: toLines(entry.draft.done), blockers: toLines(entry.draft.blockers), plan: toLines(entry.draft.plan) })
      setMessage('')
      say('bot', 'Here is your update as I understood it. Check it, edit anything, then confirm. Nothing is logged until you confirm.')
    } catch (err) { say('bot', err.message) }
    setBusy('')
  }

  async function confirm() {
    setBusy('confirm')
    try {
      const fields = { done: fromLines(edit.done), blockers: fromLines(edit.blockers), plan: fromLines(edit.plan) }
      const { entry } = await post('/api/eod/entries', { action: 'confirm', entryId: entry_id(), fields })
      setEntry(entry)
      say('bot', resultText(entry))
      load()
    } catch (err) { say('bot', err.message) }
    setBusy('')
  }

  async function retry() {
    setBusy('retry')
    try {
      const { entry } = await post('/api/eod/entries', { action: 'retry', entryId: entry_id() })
      setEntry(entry)
      say('bot', resultText(entry))
    } catch (err) { say('bot', err.message) }
    setBusy('')
  }

  const entry_id = () => entry?.id
  const logged = entry && ['Logged', 'Flagged'].includes(entry.status)
  const errors = entry?.errors && Object.entries(entry.errors)

  return (
    <>
      <Notice message={notice} onClose={() => setNotice('')} />
      <section style={card}>
        <h2 style={{ marginTop: 0 }}>Today's update</h2>
        {!me.inRoster && <p style={{ ...muted, color: '#b3261e' }}>You are not on the EOD roster, so you can't submit. Ask an admin.</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {history && !logged && thread.length === 0 && <Bubble who="bot" text={`Hi ${me.name}! What did you get done today, is anything blocking you, and what's your plan for tomorrow?`} />}
          {thread.map((m, i) => <Bubble key={i} {...m} />)}
        </div>

        {entry && (entry.status === 'Draft' || entry.status === 'Confirmed') && (
          <div style={{ border: '1px solid #e3e5e8', borderRadius: 10, padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}><strong>Your entry for {entry.date}</strong><Badge value={entry.status} /></div>
            {entry.dropped?.length > 0 && <p style={{ ...muted, color: '#c2410c' }}>I left out {entry.dropped.length} item(s) I couldn't match to your words. Add them back below if you meant them.</p>}
            {FIELDS.map(([k, label]) => (
              <label key={k} style={{ display: 'block', marginBottom: 10 }}>
                {label} <span style={muted}>(one item per line)</span>
                <textarea style={{ ...input, minHeight: 70 }} value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} disabled={entry.status !== 'Draft'} />
              </label>
            ))}
            {entry.flags?.length > 0 && <p style={muted}>Will be flagged for your TL: {entry.flags.map((f) => f.message).join('; ')}</p>}
            {entry.status === 'Draft' && <button style={button} onClick={confirm} disabled={!!busy}>{busy === 'confirm' ? 'Logging…' : 'Confirm and log'}</button>}
          </div>
        )}

        {logged && <LoggedCard entry={entry} />}
        {errors?.length > 0 && (
          <div style={{ ...card, background: '#fff4f2', boxShadow: 'none' }}>
            {errors.map(([k, v]) => <div key={k}><strong>{k === 'sheet' ? 'Google Sheet' : 'Slack'}:</strong> {v}</div>)}
            <button style={{ ...button, marginTop: 8 }} onClick={retry} disabled={!!busy}>{busy === 'retry' ? 'Retrying…' : 'Retry'}</button>
          </div>
        )}

        {!history && <p style={muted}>Loading today's status…</p>}
        {history && !logged && me.inRoster && entry?.status !== 'Confirmed' && (
          <form onSubmit={send} style={{ display: 'flex', gap: 8 }}>
            <textarea style={{ ...input, minHeight: 60 }} placeholder="e.g. Fixed the login bug and reviewed 2 PRs. Blocked on staging DB access. Tomorrow: checkout tests." value={message} onChange={(e) => setMessage(e.target.value)} />
            <button style={button} type="submit" disabled={!!busy}>{busy === 'draft' ? 'Reading…' : entry?.status === 'Draft' ? 'Rewrite' : 'Send'}</button>
          </form>
        )}
      </section>

      <section style={card}>
        <h2 style={{ marginTop: 0 }}>My history <span style={muted}>(last 30 days, from the EOD sheet)</span></h2>
        {!history ? <p>Loading…</p> : history.rows.length === 0 ? <p style={muted}>No logged entries yet.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={table}><thead><tr><th style={th}>Date</th><th style={th}>Done</th><th style={th}>Blockers</th><th style={th}>Plan</th><th style={th}>Status</th></tr></thead>
              <tbody>{history.rows.map((r) => (
                <tr key={r.sheetRowId}><td style={td}>{r.date}</td><td style={td}><List items={r.done} /></td><td style={td}><List items={r.blockers} /></td><td style={td}><List items={r.plan} /></td><td style={td}><Badge value={r.status} /></td></tr>
              ))}</tbody></table>
          </div>
        )}
      </section>
    </>
  )
}

function resultText(e) {
  if (e.errors?.sheet) return `Saved your confirmation, but writing to the sheet failed: ${e.errors.sheet}. Use Retry.`
  const parts = [`Logged to the EOD sheet (row ${e.sheet?.rowNumber ?? '?'}).`]
  parts.push(e.slack?.ts ? 'Posted to the EOD channel.' : `Slack post failed${e.errors?.slack ? `: ${e.errors.slack}` : ''}.`)
  if (e.status === 'Flagged') parts.push('It is flagged for your TL to look at; nothing else is needed from you.')
  return parts.join(' ')
}

function LoggedCard({ entry }) {
  return (
    <div style={{ border: '1px solid #cfe9dc', background: '#f3fbf7', borderRadius: 10, padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}><strong>Logged for {entry.date}</strong><Badge value={entry.status} /><span style={muted}>{fmtTime(entry.submittedAt)}</span></div>
      {FIELDS.map(([k, label]) => <div key={k} style={{ marginBottom: 6 }}><strong>{label}:</strong> <List items={entry.fields?.[k]} /></div>)}
      <div style={muted}>Sheet row {entry.sheet?.sheetRowId || '—'} · Slack {entry.slack?.ts ? 'posted' : 'not posted'}</div>
    </div>
  )
}

function Bubble({ who, text }) {
  const mine = who === 'you'
  return <div style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%', background: mine ? '#2f5bea' : '#eef0f4', color: mine ? '#fff' : '#1a1d21', padding: '8px 12px', borderRadius: 12, whiteSpace: 'pre-wrap' }}>{text}</div>
}
