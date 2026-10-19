import { readState } from '../../../lib/store.js'
import { sendInvoice } from '../../../lib/invoice.js'

// Sends one sample invoice to the address the owner types, using the saved setup.
export async function POST(req) {
  const { to } = await req.json()
  const s = readState()
  if (!s.subscription) return Response.json({ error: 'Save the setup first.' }, { status: 400 })
  if (!to) return Response.json({ error: 'Enter the email to send the test to.' }, { status: 400 })
  const row = { buyer_email: to, buyer_name: 'Test Buyer', invoice_no: 'TEST-001', amount: '100.00', date: new Date().toISOString().slice(0, 10) }
  try {
    const { doc } = await sendInvoice({ docsScriptId: s.scripts.docs, gmailScriptId: s.scripts.gmail, config: s.subscription.config, row, to })
    return Response.json({ ok: true, doc: doc.webViewLink })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
