import { requestChanges, sendDraft, updateWork } from '../../../../../lib/outreach/service.js'

// Body: { action: 'send' | 'revise' (instruction) | 'edit' (subject, body, to) | 'dismiss' | 'reset' | 'override' (verdict, noneReason, reason) }
export async function POST(req, { params }) {
  const body = await req.json()
  try {
    if (body.action === 'send') return Response.json(await sendDraft(params.id))
    if (body.action === 'revise') {
      if (!body.instruction?.trim()) return Response.json({ error: 'Say what to change' }, { status: 400 })
      return Response.json(await requestChanges(params.id, body.instruction.trim()))
    }
    return Response.json(updateWork(params.id, body))
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
