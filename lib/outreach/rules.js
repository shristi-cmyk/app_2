import { normName } from './sheets.js'

// Checks that settle "do not reach out" without spending an AI call. Each returns a reason code.
export const NONE_REASONS = {
  in_pipeline: 'Already active in the pipeline',
  rejected_before: 'Rejected or lost in an earlier conversation',
  in_conversation: 'Already in conversation with the team',
  enterprise: 'Enterprise giant: cold partnership pitch will not land',
  own_product: 'Our own or a sister product',
  duplicate: 'Duplicate of another app in the list',
  consumer: 'Consumer app or not a B2B SaaS',
  no_integration_need: 'No real integration or automation need',
  unclear: 'Unclear product or likely inactive',
  other: 'Other'
}

const ENTERPRISE = new Set(['google.com', 'microsoft.com', 'facebook.com', 'meta.com', 'amazon.com', 'aws.amazon.com', 'apple.com',
  'linkedin.com', 'adobe.com', 'salesforce.com', 'zoho.com', 'oracle.com', 'ibm.com', 'sap.com', 'x.com', 'twitter.com',
  'slack.com', 'youtube.com', 'instagram.com', 'whatsapp.com', 'paypal.com', 'shopify.com', 'stripe.com', 'atlassian.com',
  'github.com', 'dropbox.com', 'hubspot.com', 'intuit.com', 'quickbooks.intuit.com', 'openai.com', 'anthropic.com', 'twilio.com',
  'zoom.us', 'notion.so', 'servicenow.com', 'workday.com', 'tiktok.com', 'yahoo.com', 'spotify.com', 'mailchimp.com'])
const OWN = new Set(['viasocket.com', 'sokt.io', 'gtwy.ai', 'msg91.com', 'walkover.in', 'giddh.com'])

const ACTIVE = ['in conversation', 'completed', 'call/demo booked', 'snoozed', 'mail sent']

export function pipelineFor(app, pipeline) {
  const keys = [normName(app.name), normName(app.domain), normName(app.slug)].filter(Boolean)
  return pipeline.filter((p) => keys.includes(normName(p.partner)))
}

export function ruleVerdict(app, pipeline, seenDomains) {
  const domain = (app.domain || '').toLowerCase().replace(/^www\./, '')
  if (OWN.has(domain)) return 'own_product'
  if (ENTERPRISE.has(domain)) return 'enterprise'
  if (domain && seenDomains.has(domain) && seenDomains.get(domain) !== app.id) return 'duplicate'
  const rows = pipelineFor(app, pipeline)
  if (rows.some((p) => /lost|rejected/.test(p.status))) return 'rejected_before'
  if (rows.some((p) => ACTIVE.some((s) => p.status.includes(s)))) return 'in_pipeline'
  if (/lost\/rejected/i.test(app.stages)) return 'rejected_before'
  // An open listing thread is not a reason to skip: the AI sees it and pitches the next step.
  return null
}
