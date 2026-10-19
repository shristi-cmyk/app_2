import jwt from 'jsonwebtoken'

const API = process.env.VIASOCKET_API_URL

export const APPS = {
  sheets: { serviceId: 'rowqm5xi2',
    name: 'Google Sheets', 
    filteredActions: ['rowyysj8ut82'],
    icon: 'https://stuff.thingsofbrand.com/google.com/images/img4_googlesheet.png' },
  docs: { serviceId: 'row14rstzmzo',
    name: 'Google Docs', 
    filteredActions: ['rowlwzex2g2b'],
    icon: 'https://stuff.thingsofbrand.com/google.com/images/imgc_Google_Docs.png' },
  gmail: { serviceId: 'rowo0bqrhj5g',
    name: 'Gmail', 
    filteredActions: ['rowogelpy0h6'],
    icon: 'https://stuff.thingsofbrand.com/gmail.com/images/imge_idrA5FDGTH_1763454052978.svg' }
}

// Version ids (run / list-options / subscribe), copied from each app's document.
export const IDS = {
  sheetsRowTrigger: 'rowempdbsh48', // Google Sheets: Row Added Or Updated (trigger_version_id)
  sheetsSpreadsheetPicker: 'rowxwbos3gky', // List Spreadsheet Tabs -> spreadSheet_id
  sheetsTabPicker: 'rowc6kvx92xf', // Lookup Spreadsheet Rows -> sheet_Id (needs spreadsheet_Id)
  docsFromTemplate: 'rowydfsuijie', // Google Docs: Create Document From Template
  gmailSend: 'rowwj0sfmhub' // Gmail: Send Email
}

// One client per embed. The existing tools use the VIASOCKET_* embed; the EOD tool passes its own ids and secret.
export function viasocketClient(creds) {
  function embedToken(uniqueIdentifier) {
    if (!creds.secret || !API) throw new Error(`Server is missing ${creds.secretName} or VIASOCKET_API_URL`)
    return jwt.sign(
      {
        org_id: creds.orgId,
        project_id: creds.projectId,
        unique_identifier: uniqueIdentifier
      },
      creds.secret
    )
  }

  async function call(path, uid, body, method = 'POST') {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', authorization: embedToken(uid) },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    const payload = await response.json()
    if (!response.ok || payload.success === false) {
      throw new Error(payload.message || `viaSocket ${path} failed with ${response.status}`)
    }
    return payload.data
  }

  async function listFlows(uid) {
    const response = await fetch(`${API}/projects/${creds.projectId}/integrations`, {
      headers: { authorization: embedToken(uid) }
    })
    const payload = await response.json()
    return payload.data?.flows || []
  }

  async function enableApp(uid, authId, serviceId) {
    const flows = await listFlows(uid)
    const existing = flows.find((f) => f.service_id === serviceId && f.status === 'active' && f.auth_id === authId)
    if (existing) return existing.id
    const data = await call(`/embed/enable/${serviceId}/${authId}`, uid)
    return data.script_id
  }

  async function listOptions(uid, versionId, fieldKey, existingFields, authId, searchText) {
    const data = await call(`/embed/list-options/${versionId}`, uid, {
      fieldKey,
      auth_id: authId,
      existingFields: searchText ? { ...existingFields, _searchText: searchText } : existingFields
    })
    if (data && !Array.isArray(data) && data.response && Number(data.response.status) >= 400) {
      throw new Error(data.response.data?.message || 'list-options failed')
    }
    return Array.isArray(data) ? data : data.data
  }

  async function subscribeEvent(uid, triggerVersionId, authId, inputData, code) {
    const data = await call(`/embed/subscribe-event/${triggerVersionId}`, uid, {
      auth_id: authId,
      inputData,
      code,
      meta: { user_id: uid }
    })
    return data.script_id
  }

  return {
    embedToken,
    call,
    listFlows,
    enableApp,
    listOptions,
    subscribeEvent,
    listConnections: (uid) => call('/embed/authentications', uid, undefined, 'GET'),
    setFlowStatus: (uid, scriptId, status = 0) => call(`/embed/updatestatus/${scriptId}?status=${status}`, uid, undefined, 'PUT'),
    updateSubscription: (uid, scriptId, changes) => call(`/embed/update-subscribed-event/${scriptId}`, uid, changes, 'PUT')
  }
}

// The existing tools' embed, read from the environment on every call as before.
const main = () => viasocketClient({
  orgId: process.env.VIASOCKET_ORG_ID,
  projectId: process.env.VIASOCKET_PROJECT_ID,
  secret: process.env.VIASOCKET_EMBED_SECRET,
  secretName: 'VIASOCKET_EMBED_SECRET'
})

export const embedToken = (uid) => main().embedToken(uid)
export const listFlows = (uid) => main().listFlows(uid)
export const enableApp = (uid, authId, serviceId) => main().enableApp(uid, authId, serviceId)
export const listConnections = (uid) => main().listConnections(uid)
export const setFlowStatus = (uid, scriptId, status = 0) => main().setFlowStatus(uid, scriptId, status)
export const listOptions = (...args) => main().listOptions(...args)

export async function runAction(scriptId, versionId, inputData) {
  const response = await fetch(`https://flow.sokt.io/func/${scriptId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action_version_id: versionId, inputData })
  })
  const payload = await response.json()
  const isEnvelope = payload && typeof payload === 'object' && typeof payload.success === 'boolean' && 'data' in payload
  if (isEnvelope ? !payload.success : payload?.success === false) throw new Error(payload.message || payload.error?.message || 'Action failed')
  return isEnvelope ? payload.data : payload
}

export const subscribeEvent = (...args) => main().subscribeEvent(...args)
export const updateSubscription = (uid, scriptId, changes) => main().updateSubscription(uid, scriptId, changes)
