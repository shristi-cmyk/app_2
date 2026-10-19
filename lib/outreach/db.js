import fs from 'node:fs'
import path from 'node:path'

// Outreach data (apps, judgments, drafts, pipeline) in one JSON file beside state.json.
// Kept in memory and written after each change; one process, one owner.
const dir = process.env.DATA_DIR || './data'
const file = path.join(dir, 'outreach.json')

export const DEFAULT_SETTINGS = {
  senderName: '',
  senderTitle: 'Partnerships, viaSocket',
  team: '',
  company: 'viaSocket is a workflow automation platform that connects 2,300+ apps (an alternative to Zapier and Make), with AI agents and MCP built in.',
  sdkPitch: 'viaSocket Embed (SDK): a white-label integrations layer the partner drops into their own product, so their users can connect 2,300+ apps and build automations without leaving it. The partner skips building and maintaining each integration (no OAuth apps, token refresh or webhooks to run).',
  gtmPitch: 'Go-to-market partnership: we already have their app live on viaSocket. We offer joint promotion: listing viaSocket on their integrations page or marketplace, co-written blog posts and use-case templates, social posts, newsletter mentions and webinars, so both sides reach each other\'s users.',
  sdkLink: 'https://viasocket.com/embed',
  guidelines: 'Short (under 140 words), warm, specific to their product, one clear ask (a 15-minute call or a reply). No buzzwords, no fake familiarity, no exclamation marks.',
  effort: 'medium'
}

function load() {
  try {
    const d = JSON.parse(fs.readFileSync(file, 'utf8'))
    // A run cut short by a restart is not running any more.
    if (d.job) d.job.running = false
    return { apps: {}, pipeline: [], job: null, ...d, settings: { ...DEFAULT_SETTINGS, ...(d.settings || {}) } }
  } catch {
    return { apps: {}, pipeline: [], job: null, settings: { ...DEFAULT_SETTINGS } }
  }
}

const g = globalThis
export function db() {
  if (!g.__outreachDb) g.__outreachDb = load()
  return g.__outreachDb
}

export function save() {
  fs.mkdirSync(dir, { recursive: true })
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(g.__outreachDb), { mode: 0o600 })
  fs.renameSync(tmp, file)
}

export function change(fn) {
  const d = db()
  const out = fn(d)
  save()
  return out
}
