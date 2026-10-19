import { IDS, runAction } from './viasocket.js'

export const FIELDS = ['buyer_email', 'buyer_name', 'invoice_no', 'amount', 'date']

export function fill(template, row) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => (row[key] ?? '').toString())
}

// A placeholder option names its field in `key` (Docs) or `value` (other fields); the name is used verbatim.
export const tagKey = (o) => o.key ?? o.value

// Maps the template's placeholder options (from list-options on the `tags` field) to row values.
// An option matches a column when its label or value mentions the column name, e.g. "{{buyer_name}}".
export function buildTags(options, row) {
  const tags = {}
  for (const col of FIELDS) {
    const hit = options.find((o) => `${o.label} ${tagKey(o)}`.toLowerCase().includes(col))
    if (hit) tags[tagKey(hit)] = String(row[col] ?? '')
  }
  return tags
}

// Used by the "send a test" button. The live handler (below) does the same steps on viaSocket.
export async function sendInvoice({ docsScriptId, gmailScriptId, config, row, to }) {
  const doc = await runAction(docsScriptId, IDS.docsFromTemplate, {
    template_id: config.templateId,
    title: `Invoice ${row.invoice_no}`,
    tags: buildTags(config.tagOptions, row),
    download_format: ['application/pdf']
  })
  const pdf = doc.downloadLinks?.['application/pdf']
  if (!pdf) throw new Error('Google Docs did not return a PDF link')
  const sent = await runAction(gmailScriptId, IDS.gmailSend, {
    to: to || row.buyer_email,
    subject: fill(config.subject, row),
    messageBody: fill(config.body, row).replace(/\n/g, '<br>'),
    attachments: pdf
  })
  return { doc, sent }
}

// A string run by viaSocket for every new row (no server of ours in the path).
// Values baked in at subscribe time: script ids, template id, tag options, subject and body.
export function buildHandler({ docsScriptId, gmailScriptId, config }) {
  return `
  const event = context.req.body
  const row = event.values || {}
  if (!row.buyer_email) return { skipped: 'no buyer_email' }
  const fields = ${JSON.stringify(FIELDS)}
  const options = ${JSON.stringify(config.tagOptions)}
  const fill = (t) => t.replace(/\\{\\{\\s*(\\w+)\\s*\\}\\}/g, (_, k) => String(row[k] ?? ''))
  const tags = {}
  for (const col of fields) {
    const hit = options.find((o) => (o.label + ' ' + (o.key ?? o.value)).toLowerCase().includes(col))
    if (hit) tags[hit.key ?? hit.value] = String(row[col] ?? '')
  }
  const run = async (scriptId, version, inputData) => {
    const r = await fetch('https://flow.sokt.io/func/' + scriptId, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_version_id: version, inputData })
    })
    const j = await r.json()
    if ('data' in j ? !j.success : j.success === false) throw new Error(j.message || 'action failed')
    return 'data' in j ? j.data : j
  }
  const doc = await run(${JSON.stringify(docsScriptId)}, ${JSON.stringify(IDS.docsFromTemplate)}, {
    template_id: ${JSON.stringify(config.templateId)},
    title: 'Invoice ' + row.invoice_no,
    tags,
    download_format: ['application/pdf']
  })
  const pdf = doc.downloadLinks && doc.downloadLinks['application/pdf']
  if (!pdf) throw new Error('no PDF link from Google Docs')
  return await run(${JSON.stringify(gmailScriptId)}, ${JSON.stringify(IDS.gmailSend)}, {
    to: row.buyer_email,
    subject: fill(${JSON.stringify(config.subject)}),
    messageBody: fill(${JSON.stringify(config.body)}).replace(/\\n/g, '<br>'),
    attachments: pdf
  })
`
}
