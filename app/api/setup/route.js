import { IDS, listOptions, subscribeEvent, setFlowStatus } from '../../../lib/viasocket.js'
import { UID } from '../../../lib/user.js'
import { readState, updateState } from '../../../lib/store.js'
import { buildHandler, FIELDS } from '../../../lib/invoice.js'

export async function POST(req) {
  const { spreadsheetId, sheetId, templateId, subject, body, labels } = await req.json()
  const s = readState()
  if (!s.auth.sheets || !s.scripts.docs || !s.scripts.gmail) {
    return Response.json({ error: 'Connect Google Sheets, Google Docs and Gmail first.' }, { status: 400 })
  }
  if (!spreadsheetId || !sheetId || !templateId) return Response.json({ error: 'Pick a sheet, a tab and a template.' }, { status: 400 })
  try {
    // The template's placeholders, as the Docs action itself lists them (option values are used verbatim as keys).
    const tagOptions = await listOptions(UID, IDS.docsFromTemplate, 'tags', { template_id: templateId }, s.auth.docs)
    const missing = FIELDS.filter((c) => !tagOptions.some((o) => `${o.label} ${o.key ?? o.value}`.toLowerCase().includes(c)))
    if (missing.length) {
      return Response.json({ error: `The template has no placeholder for: ${missing.join(', ')}. Found: ${tagOptions.map((o) => o.label).join(', ') || 'none'}` }, { status: 400 })
    }
    const config = { spreadsheetId, sheetId, templateId, subject, body, labels: labels || {}, tagOptions }
    const code = buildHandler({ docsScriptId: s.scripts.docs, gmailScriptId: s.scripts.gmail, config })
    if (s.subscription) await setFlowStatus(UID, s.subscription.scriptId, 0) // never two live subscriptions
    const scriptId = await subscribeEvent(UID, IDS.sheetsRowTrigger, s.auth.sheets, {
      spreadSheet_id: spreadsheetId,
      sheet_id: sheetId,
      record_type: 'new',
      column_key: true
    }, code)
    updateState((st) => {
      st.subscription = { scriptId, config, createdAt: new Date().toISOString() }
    })
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
