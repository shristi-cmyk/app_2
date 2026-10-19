'use client'
import { useEffect, useState, useCallback } from 'react'
import { Shell, card, input, button, ghost, muted, table, th, td, Badge, getJson, post, toLines, fromLines, Notice, fmtTime, List, Skeleton } from './ui.js'

export default function EmployeeChat() {
  return <Shell path="/eod">{(me) => <Chat me={me} />}</Shell>
}

const FIELDS = [['done', 'Done today', '#0e7490'], ['blockers', 'Blockers', '#be185d'], ['plan', 'Plan for tomorrow', '#4f46e5']]

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
  }).catch((e) => setHistory({ rows: [], loadError: e.message })), [])
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

  const step = logged ? 3 : entry && (entry.status === 'Draft' || entry.status === 'Confirmed') ? 2 : 1
  const addChip = (text) => setMessage((m) => (m && !m.endsWith('\n') ? m + '\n' : m) + text)
  const onKey = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(e) }

  return (
    <>
      <Notice message={notice} onClose={() => setNotice('')} />
      <section style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ margin: 0 }}>Today's update</h2>
          <span style={muted}>{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        </div>
        <Steps step={step} />
        {!me.inRoster && <p style={{ ...muted, color: '#d03b3b' }}>You are not on the EOD roster, so you can't submit. Ask an admin to tick "On roster" for you in Settings.</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          {history && !logged && thread.length === 0 && <Bubble who="bot" text={`Hi ${me.name.split(' ')[0]}! What did you get done today, is anything blocking you, and what's your plan for tomorrow?`} />}
          {thread.map((m, i) => <Bubble key={i} {...m} />)}
          {busy === 'draft' && <div className="eod-bubble bot eod-typing" aria-label="Reading your update"><span /><span /><span /></div>}
        </div>

        {entry && (entry.status === 'Draft' || entry.status === 'Confirmed') && (
          <div style={{ border: '1px solid #e0e3ff', background: '#fafaff', borderRadius: 14, padding: 18, marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}><strong>Check your entry for {entry.date}</strong><Badge value={entry.status} /><span style={muted}>Edit freely: one item per line. Nothing is logged until you confirm.</span></div>
            {entry.dropped?.length > 0 && <p style={{ ...muted, color: '#d4622f' }}>⚑ I left out {entry.dropped.length} item(s) I couldn't match to your words. Add them back if you meant them.</p>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {FIELDS.map(([k, label, color]) => (
                <label key={k} style={{ display: 'block', borderTop: `3px solid ${color}`, background: '#fff', borderRadius: 10, padding: 12, fontWeight: 600, fontSize: 14 }}>
                  {label} <span style={{ ...muted, fontWeight: 400 }}>· {fromLines(edit[k]).length}</span>
                  <textarea style={{ ...input, minHeight: 96, marginTop: 8, fontWeight: 400 }} value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} disabled={entry.status !== 'Draft'} />
                </label>
              ))}
            </div>
            {entry.flags?.length > 0 && <p style={{ ...muted, marginBottom: 0 }}>⚑ Your TL will be asked to look at this: {entry.flags.map((f) => f.message).join('; ')}</p>}
            {entry.status === 'Draft' && <button style={{ ...button, marginTop: 14 }} onClick={confirm} disabled={!!busy}>{busy === 'confirm' ? 'Logging…' : '✓ Confirm and log'}</button>}
          </div>
        )}

        {logged && <LoggedCard entry={entry} />}
        {errors?.length > 0 && (
          <div style={{ border: '1px solid #f5c2c2', background: '#fff5f5', borderRadius: 12, padding: 14, marginBottom: 14 }}>
            {errors.map(([k, v]) => <div key={k}>✕ <strong>{k === 'sheet' ? 'Google Sheet' : 'Slack'}:</strong> {v}</div>)}
            <button style={{ ...button, marginTop: 10 }} onClick={retry} disabled={!!busy}>{busy === 'retry' ? 'Retrying…' : 'Retry'}</button>
          </div>
        )}

        {!history && <Skeleton lines={2} height={40} />}
        {history && !logged && me.inRoster && entry?.status !== 'Confirmed' && (
          <form onSubmit={send}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {[['＋ Done', 'Done: '], ['＋ Blockers', 'Blockers: '], ['No blockers', 'No blockers.'], ['＋ Tomorrow', 'Tomorrow: ']].map(([l, t]) => (
                <button key={l} type="button" className="eod-chip" onClick={() => addChip(t)}>{l}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <textarea style={{ ...input, minHeight: 84, resize: 'vertical' }} placeholder="e.g. Fixed the login bug and reviewed 2 PRs. Blocked on staging DB access. Tomorrow: checkout tests." value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={onKey} maxLength={4000} />
              <button style={{ ...button, padding: '12px 20px' }} type="submit" disabled={!!busy || !message.trim()}>{busy === 'draft' ? 'Reading…' : entry?.status === 'Draft' ? 'Rewrite' : 'Send'}</button>
            </div>
            <div style={{ ...muted, display: 'flex', justifyContent: 'space-between', marginTop: 6 }}><span>Ctrl + Enter to send</span><span>{message.length}/4000</span></div>
          </form>
        )}
      </section>

      <section style={card}>
        <h2 style={{ marginTop: 0 }}>My history <span style={{ ...muted, fontWeight: 400 }}>· last 30 days, from the EOD sheet</span></h2>
        {!history ? <Skeleton lines={4} /> : history.loadError || history.sheetError ? <p style={{ ...muted, color: '#d03b3b' }}>History is unavailable: {history.loadError || history.sheetError}</p> : history.rows.length === 0 ? <p style={muted}>No logged entries yet. Your confirmed updates will appear here.</p> : (
          <div style={{ display: 'grid', gap: 10 }}>
            {history.rows.map((r) => (
              <details key={r.sheetRowId} style={{ border: '1px solid #eef0f5', borderRadius: 12, padding: '10px 14px', minWidth: 0 }}>
                <summary style={{ display: 'flex', gap: 10, alignItems: 'center', listStyle: 'none', flexWrap: 'wrap' }}>
                  <strong style={{ minWidth: 100 }}>{new Date(r.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</strong>
                  <span style={{ ...muted, flex: '1 1 160px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.done.join(' · ') || '—'}</span>
                  {r.blockers.length > 0 && <span style={{ fontSize: 12, color: '#6b7280' }}>⚠ {r.blockers.length} blocker{r.blockers.length > 1 ? 's' : ''}</span>}
                  <Badge value={r.status} />
                </summary>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 10 }}>
                  {FIELDS.map(([k, label]) => <div key={k}><div style={{ ...muted, fontWeight: 600, marginBottom: 4 }}>{label}</div><List items={r[k]} /></div>)}
                </div>
                <div style={{ ...muted, marginTop: 8 }}>Sheet row {r.sheetRowId}</div>
              </details>
            ))}
          </div>
        )}
      </section>
    </>
  )
}

function Steps({ step }) {
  const items = ['Write', 'Review', 'Logged']
  return (
    <div className="eod-steps" aria-label={`Step ${step} of 3`}>
      {items.map((label, i) => (
        <span key={label} style={{ display: 'contents' }}>
          {i > 0 && <span className="eod-step-line" />}
          <span className="eod-step" data-state={i + 1 < step || step === 3 ? 'done' : i + 1 === step ? 'current' : 'todo'}><i>{i + 1 < step || step === 3 ? '✓' : i + 1}</i>{label}</span>
        </span>
      ))}
    </div>
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
    <div style={{ border: '1px solid #c8ecc8', background: '#f4fbf4', borderRadius: 14, padding: 18, marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}><strong>🎉 You're done for {entry.date}</strong><Badge value={entry.status} /><span style={muted}>{fmtTime(entry.submittedAt)}</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        {FIELDS.map(([k, label]) => <div key={k}><div style={{ ...muted, fontWeight: 600, marginBottom: 4 }}>{label}</div><List items={entry.fields?.[k]} /></div>)}
      </div>
      <div style={{ ...muted, marginTop: 10 }}>Sheet row {entry.sheet?.sheetRowId || '—'} · Slack {entry.slack?.ts ? 'posted ✓' : 'not posted'}</div>
    </div>
  )
}

function Bubble({ who, text }) {
  return <div className={`eod-bubble ${who === 'you' ? 'you' : 'bot'}`}>{text}</div>
}
