import { viasocketClient } from '../viasocket.js'
import { VS, WORKSPACE_UID, AUTOMATION, RUN_URL, SLACK, SHEETS } from './config.js'
import { db, change } from './db.js'

const client = viasocketClient(VS)
const API = (process.env.VIASOCKET_API_URL || 'https://flow-api.viasocket.com/').replace(/\/$/, '')

export const workspaceToken = () => client.embedToken(WORKSPACE_UID)
export const listFlows = () => client.listFlows(WORKSPACE_UID)
export const listConnections = () => client.listConnections(WORKSPACE_UID)
export const setFlowStatus = (scriptId, status) => client.setFlowStatus(WORKSPACE_UID, scriptId, status)

export class ActionError extends Error {}

// Runs one app action on the workspace's runner. Stricter than the shared runAction: Slack reports some
// failures as HTTP 200 with a bare string body ("restricted_action_read_only_channel") or { ok: false }.
// raw: return the whole body (List Rows keeps its paging `offset` beside `data`).
// allow: envelope failure messages that are an answer, not an error ("The selected sheet is empty.").
export async function runAction(scriptId, versionId, inputData, { allow = [], raw = false } = {}) {
  const response = await fetch(`${RUN_URL}${scriptId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action_version_id: versionId, inputData })
  })
  const text = await response.text()
  let payload
  try { payload = JSON.parse(text) } catch { payload = text }
  if (typeof payload === 'string') throw new ActionError(payload.slice(0, 200) || `Action failed (${response.status})`)
  if (!response.ok) throw new ActionError(payload?.message || `Action failed (${response.status})`)
  const isEnvelope = typeof payload.success === 'boolean' && 'data' in payload
  if (isEnvelope && !payload.success && !allow.includes(payload.message)) throw new ActionError(payload.message || 'Action failed')
  if (!isEnvelope && (payload.success === false || payload.ok === false)) throw new ActionError(payload.message || payload.error?.message || payload.error || 'Action failed')
  return isEnvelope && payload.success && !raw ? payload.data : payload
}

export const listOptions = (versionId, fieldKey, existingFields, authId, searchText) =>
  client.listOptions(WORKSPACE_UID, versionId, fieldKey, existingFields, authId, searchText)

// ---- Connections (sponsored: one per company, made by the admin) ----

const APPS = { slack: SLACK, sheets: SHEETS }

export function connection(app) {
  const c = db().connections[app]
  if (!c?.authId || !c?.scriptId) throw new ActionError(`${APPS[app].name} is not connected. An admin connects it on the Integrations page.`)
  return c
}

// The admin's popup reported an auth_id: check it really is a connection of the workspace for that app
// (never trust the browser's word), enable the app once for a runner, and store both server-side.
export async function saveConnection(app, authId) {
  const meta = APPS[app]
  if (!meta) throw new ActionError('Unknown app')
  const list = await listConnections()
  const found = list.find((c) => c.id === authId && c.service_id === meta.serviceId)
  if (!found) throw new ActionError(`That ${meta.name} connection was not found for this workspace.`)
  const scriptId = await client.enableApp(WORKSPACE_UID, authId, meta.serviceId)
  change((d) => { d.connections[app] = { authId, scriptId, connectedAt: new Date().toISOString() } })
  await nameRunner(scriptId, meta.name).catch(() => {})
}

// The enable call titles the runner with the bare service id (rowbu58rc); give it a name a person reads.
const runnerTitle = (appName) => `EOD Reports · ${appName} connection`
async function nameRunner(scriptId, appName) {
  await client.call(`/projects/updateflowembed/${scriptId}`, WORKSPACE_UID, {
    title: runnerTitle(appName),
    description: `Runs ${appName} actions for EOD Reports. Pausing or deleting it stops EOD posting and logging.`
  }, 'PUT')
}

function accountLabel(c) {
  try {
    const l = JSON.parse(c.connection_label)
    return l.Email || l.email || (l.team ? `workspace ${l.team}` : Object.values(l)[0])
  } catch { return c.connection_label || '' }
}

// Real status from viaSocket, never only from what we stored: missing, expired or connected.
export async function connectionStatus() {
  let list = []
  let error = null
  try { list = await listConnections() } catch (e) { error = e.message }
  const out = {}
  try {
    const flows = await listFlows()
    for (const [key, meta] of Object.entries(APPS)) {
      const id = db().connections[key]?.scriptId
      const f = id && flows.find((x) => x.id === id)
      if (f && f.title !== runnerTitle(meta.name)) await nameRunner(id, meta.name)
    }
  } catch {}
  for (const [key, meta] of Object.entries(APPS)) {
    const stored = db().connections[key]
    const live = stored && list.find((c) => c.id === stored.authId)
    out[key] = {
      name: meta.name, icon: meta.icon, serviceId: meta.serviceId, filteredActions: meta.filteredActions,
      state: error ? 'unknown' : !stored ? 'not_connected' : !live ? 'missing' : live.isExpired ? 'expired' : 'connected',
      account: live ? accountLabel(live) : '',
      // The admin's own reconnect needs the auth_id in the popup call; it is not a credential on its own.
      authId: stored?.authId || null,
      error
    }
  }
  return out
}

// ---- AI in the product (no model key: viaSocket runs it) ----

export async function aiMessage(body) {
  const response = await fetch(`${API}/embed/ai/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: workspaceToken() },
    body: JSON.stringify(body)
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.success) throw new ActionError(`AI request failed: ${payload.message || response.status}`)
  return payload.data
}

// ---- Automations from code ----

async function proxyToken() {
  const response = await fetch(`${API}/users/register`, { headers: { Authorization: workspaceToken() } })
  const payload = await response.json().catch(() => ({}))
  if (!payload?.data?.token) throw new ActionError(`viaSocket register failed: ${payload.message || response.status}`)
  return payload.data.token
}

async function sokt(fn, body) {
  const response = await fetch(`${RUN_URL}${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const payload = await response.json().catch(() => ({}))
  // A refused call still answers 200, with status 400 and the reason in data.message.
  if (payload?.status === 400 || payload?.data?.success === false || payload?.success === false) {
    throw new ActionError(payload?.data?.message || payload?.message || 'viaSocket refused the call')
  }
  return payload
}

export async function createFlow({ title, description, trigger, steps }) {
  const token = await proxyToken()
  const created = await sokt(AUTOMATION.create, { title, description, projectId: VS.projectId, proxy_auth_token: token })
  const scriptId = created?.data?.script_id
  if (!scriptId) throw new ActionError('viaSocket did not return a flow id')
  const t = await sokt(AUTOMATION.trigger, { scriptId, projectId: VS.projectId, ...trigger, proxy_auth_token: token })
  if (!(t.success || t.trigger)) throw new ActionError('Trigger was not saved')
  const s = await sokt(AUTOMATION.steps, { scriptId, steps, proxy_auth_token: token })
  if (!Array.isArray(s.steps)) throw new ActionError('Steps were not saved')
  return scriptId
}

// Same flow, new trigger and steps (one flow per automation: a second one would be a duplicate).
export async function updateFlow(scriptId, { trigger, steps }) {
  const token = await proxyToken()
  const t = await sokt(AUTOMATION.trigger, { scriptId, projectId: VS.projectId, ...trigger, proxy_auth_token: token })
  if (!(t.success || t.trigger)) throw new ActionError('Trigger was not saved')
  const s = await sokt(AUTOMATION.steps, { scriptId, steps, proxy_auth_token: token })
  if (!Array.isArray(s.steps)) throw new ActionError('Steps were not saved')
}

export async function readFlow(scriptId) {
  const token = await proxyToken()
  return sokt(AUTOMATION.read, { scriptId, env: 'prod', proxy_auth_token: token })
}

export async function flowRuns(scriptId, limit = 5) {
  const token = await proxyToken()
  const url = `${API}/logs/orgId/${VS.orgId}?projectId=${VS.projectId}&scriptId=${scriptId}&page=1&limit=${limit}`
  const response = await fetch(url, { headers: { proxy_auth_token: token } })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new ActionError(payload.message || `Run history failed (${response.status})`)
  // Only the fields worth showing; the raw entry carries request headers.
  return (payload.data?.finalResponse || []).map((r) => ({ status: r.status, createdAt: r.createdAt, flowHitId: r.flowHitId }))
}
