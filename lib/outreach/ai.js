import { enableApp, listFlows, runAction } from '../viasocket.js'
import { readState, updateState } from '../store.js'
import { UID } from '../user.js'
import { NONE_REASONS } from './rules.js'

// viaSocket's built-in AI ("Run AI Model", viaSocket utilities). No sign-in: the auth id is the string NoAuth.
const AI_SERVICE = 'row29ruc9gs1'
const RUN_AI_MODEL = 'row9t37oaial' // action_version_id

let scriptPromise
async function aiScript() {
  const saved = readState().scripts?.ai
  if (saved) return saved
  // Enable once per server; concurrent callers share the same promise.
  scriptPromise ||= (async () => {
    const flows = await listFlows(UID)
    const id = flows.find((f) => f.service_id === AI_SERVICE && f.status === 'active')?.id || (await enableApp(UID, 'NoAuth', AI_SERVICE))
    updateState((s) => { s.scripts.ai = id })
    return id
  })().finally(() => { scriptPromise = undefined })
  return scriptPromise
}

const VERDICTS = ['sdk', 'gtm', 'none']
const CONFIDENCE = ['high', 'medium', 'low']

const JUDGE_SHAPE = {
  verdict: 'sdk | gtm | none',
  confidence: 'high | medium | low',
  reason: 'one or two sentences: why this verdict, citing facts about the app',
  noneReason: `when verdict is none, one of: ${Object.keys(NONE_REASONS).join(' | ')}; otherwise "other"`,
  subject: 'email subject; empty when verdict is none',
  body: 'plain-text email body with greeting and sign-off; empty when verdict is none'
}
const DRAFT_SHAPE = { subject: 'email subject', body: 'plain-text email body with greeting and sign-off' }

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
- Plain text, no markdown, no placeholders other than the sign-off name when it is unknown.

Reply with a JSON object only.`
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

async function ask(settings, shape, query) {
  const out = await runAction(await aiScript(), RUN_AI_MODEL, {
    prompt: system(settings),
    query,
    reasoning: settings.effort || 'medium',
    response_type: 'json_object',
    response_json_structure: JSON.stringify(shape)
  })
  try {
    return typeof out.content === 'string' ? JSON.parse(out.content) : out.content
  } catch {
    throw new Error('The AI did not return valid JSON; try again')
  }
}

export async function judge(app, history, settings) {
  const hint = app.work?.hint ? `\n\nThe owner has already decided this is a "${app.work.hint}" pitch: use that verdict and write the email.` : ''
  const out = await ask(settings, JUDGE_SHAPE, `App:\n${describe(app, history)}${hint}`)
  const verdict = VERDICTS.includes(out.verdict) ? out.verdict : app.work?.hint
  if (!verdict) throw new Error(`The AI returned an unknown verdict "${out.verdict}"`)
  if (verdict !== 'none' && !(out.subject && out.body)) throw new Error('The AI returned no email draft')
  return {
    verdict,
    confidence: CONFIDENCE.includes(out.confidence) ? out.confidence : 'low',
    reason: String(out.reason || ''),
    noneReason: verdict === 'none' ? (NONE_REASONS[out.noneReason] ? out.noneReason : 'other') : undefined,
    subject: verdict === 'none' ? '' : String(out.subject),
    body: verdict === 'none' ? '' : String(out.body)
  }
}

export async function revise(app, history, draft, instruction, settings) {
  const out = await ask(settings, DRAFT_SHAPE,
    `App:\n${describe(app, history)}\n\nPitch: ${draft.verdict}\n\nCurrent draft\nSubject: ${draft.subject}\n\n${draft.body}\n\nRewrite it with this change: ${instruction}`)
  if (!out.subject || !out.body) throw new Error('The AI returned no draft')
  return { subject: String(out.subject), body: String(out.body) }
}
