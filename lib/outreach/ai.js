import Anthropic from '@anthropic-ai/sdk'
import { NONE_REASONS } from './rules.js'

const MODEL = 'claude-opus-5-5'
let client
const anthropic = () => (client ||= new Anthropic())

const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['sdk', 'gtm', 'none'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    reason: { type: 'string', description: 'One or two sentences: why this verdict, citing facts about the app.' },
    noneReason: { type: 'string', enum: Object.keys(NONE_REASONS), description: 'Only meaningful when verdict is none; otherwise "other".' },
    subject: { type: 'string', description: 'Email subject. Empty when verdict is none.' },
    body: { type: 'string', description: 'Plain-text email body with a greeting and sign-off. Empty when verdict is none.' }
  },
  required: ['verdict', 'confidence', 'reason', 'noneReason', 'subject', 'body'],
  additionalProperties: false
}

const DRAFT_SCHEMA = {
  type: 'object',
  properties: { subject: { type: 'string' }, body: { type: 'string' } },
  required: ['subject', 'body'],
  additionalProperties: false
}

function system(settings) {
  return `You decide how viaSocket's partnerships team should approach each app in its catalog, and draft the first email.

About viaSocket: ${settings.company}

The two pitches:
- "sdk": ${settings.sdkPitch}${settings.sdkLink ? ` Link: ${settings.sdkLink}` : ''}
- "gtm": ${settings.gtmPitch}
- "none": do not reach out.

How to decide:
- Pick "sdk" when the app is a B2B SaaS product whose own customers need to connect it to other tools (CRMs, helpdesks, forms, marketing, e-commerce, project tools, AI agents, vertical SaaS) and integrations are not already their core business. Many actions/triggers on viaSocket and an API are good signs. Small and mid-size vendors are the best fit.
- Pick "gtm" when an embedded SDK is a poor fit but joint promotion makes sense: the app is live on viaSocket, has an integrations page, marketplace, partner program, blog or active community, or an earlier listing/verification thread that can move on to co-marketing.
- Pick "none" for consumer apps, utilities or public data feeds with no partner motion, enterprise giants, products that are themselves automation/iPaaS competitors, unclear or likely inactive products, or anything the history says to leave alone. Choose the closest noneReason.
- Use only the facts given. Say "low" confidence when the description is thin.

Writing the email (sdk and gtm only):
- ${settings.guidelines}
- Address the contact by first name if known, else "Hi {app name} team".
- Mention one concrete thing about their product and one use case that fits it.
- If there was an earlier thread (listing, verification), refer to it briefly as the reason to write again.
- Sign off as: ${settings.senderName || '[Your name]'}${settings.senderTitle ? `, ${settings.senderTitle}` : ''}
- Plain text, no markdown, no placeholders other than the sign-off name when it is unknown.`
}

function describe(app, history) {
  const facts = {
    name: app.name, domain: app.domain, category: app.category, description: app.description, tags: app.tags.slice(0, 10),
    viasocket_actions: app.actionCount, viasocket_triggers: app.triggerCount, sample_actions: app.actions, sample_triggers: app.triggers,
    api_docs: app.apiDocs || undefined, contact: [app.contactName, app.contactRole].filter(Boolean).join(', ') || undefined,
    earlier_outreach: [app.mailStatus, app.stages, app.notes, app.listing, app.blocker].filter(Boolean).join(' | ') || 'none recorded',
    pipeline_history: history.length ? history.map((p) => `${p.reason || ''} · ${p.stage} · ${p.status} · ${p.notes}`.trim()) : undefined
  }
  return JSON.stringify(facts, null, 1)
}

async function structured(settings, schema, messages) {
  const res = await anthropic().beta.messages.create({
    model: MODEL,
    max_tokens: 8000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: system(settings), cache_control: { type: 'ephemeral' } }],
    output_config: { effort: settings.effort || 'medium', format: { type: 'json_schema', schema } },
    messages
  })
  if (res.stop_reason === 'refusal') throw new Error('The model declined this request')
  if (res.stop_reason === 'max_tokens') throw new Error('The model ran out of room; try again')
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
  return JSON.parse(text)
}

export async function judge(app, history, settings) {
  const hint = app.work?.hint ? `\n\nThe owner has already decided this is a "${app.work.hint}" pitch: use that verdict and write the email.` : ''
  const out = await structured(settings, JUDGE_SCHEMA, [{ role: 'user', content: `App:\n${describe(app, history)}${hint}` }])
  if (out.verdict !== 'none') out.noneReason = undefined
  return out
}

export async function revise(app, history, draft, instruction, settings) {
  return structured(settings, DRAFT_SCHEMA, [{
    role: 'user',
    content: `App:\n${describe(app, history)}\n\nPitch: ${draft.verdict}\n\nCurrent draft\nSubject: ${draft.subject}\n\n${draft.body}\n\nRewrite it with this change: ${instruction}`
  }])
}
