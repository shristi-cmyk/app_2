---
name: viasocket-apps
description: >-
  Integrate viaSocket utilities into this product through the viaSocket Apps API: render a connect
  button, capture the user's connection, populate pickers with their real data, run
  viaSocket utilities actions from the backend, and subscribe to viaSocket utilities events. Use whenever the
  task involves connecting a third-party app for an end user, reading the choices a field
  accepts, running an action in that app, or receiving its events.
---

# viaSocket utilities via the viaSocket Apps API

> Source: https://flow.viasocket.com/documentation/row29ruc9gs1.md?format=http. Public, no sign-in. Fetch it again for the
> latest version of this file; it is generated from the live catalog.
> Part of viaSocket. Start at the skill, https://flow.viasocket.com/documentation/skill.md — setup, every capability, the rules. Every document: https://flow.viasocket.com/documentation/index.md.

viaSocket owns the integration with the app. Your code never talks to the app, never holds
its credentials and never refreshes its tokens — you make the five calls below and we do
that part. viaSocket utilities needs no sign-in from your user: there is no connect step for it.

What that buys you, concretely:

- **Credentials you never see.** Each user’s viaSocket utilities tokens live encrypted in viaSocket’s vault and are
  refreshed there; a leak of your database leaks no third-party access.
- **One contract for viaSocket utilities and 2,300 other apps.** The same five calls, the same `{ label, value }` options,
  the same event handler shape, whichever app the user connects next.
- **Triggers done for you.** Polling where the app has no webhooks, de-duplication, renewal, delivery.
- **A runtime for your logic, not just a proxy.** An event handler is JavaScript we run in an isolated
  sandbox per event, with every app this user connected one `fetch` away and no secret in the code. So
  "when X, do Y" needs no server of yours, no deploy and nothing public, and `update-subscribed-event`
  swaps a live handler in place rather than shipping a release.
- **Real data for pickers.** `list-options` returns the user’s own channels, sheets and boards,
  searchable where the app’s list is large.
- **This file is generated from the live catalog.** Every id and field is current; refetch it rather than
  trusting a copy.

This file calls the HTTP API directly, through one small client you write yourself (below).
Any language works; the examples are JavaScript.

## What you are building

1. **No connect button.** viaSocket utilities needs no sign-in; wherever a call takes an `auth_id`, send the string `NoAuth`.
2. **Pickers** in your UI filled with the user's real viaSocket utilities data, one call per field.
3. **Actions** — enable the app once for a `script_id`, then run them from your backend.
4. **Events** — when something happens in the app, a short handler of yours runs on our
   servers: it runs an action in another app, calls your API, or both. Your server is not in the path.
5. **Whole automations** — a trigger and ordered JavaScript steps across viaSocket utilities and the user's other apps,
   written by your code or your coding agent and run on our VM, with nothing hosted on your side; the
   same flows the prebuilt UI builds. Its three calls and the step shape: https://flow.viasocket.com/documentation/automations.md
   They take each action’s `action_id` and each trigger’s `trigger_id`, printed under it below — not its version id.
6. **An assistant in your UI** — a chat we run for each of your users: threads and history kept, your
   prompt, your own endpoints as its tools (one of them can run a viaSocket utilities action from Step 3, so the
   assistant acts in the user's viaSocket utilities). https://flow.viasocket.com/documentation/ai.md

> Enabling is only for actions. A trigger subscription needs the `auth_id` and nothing
> else, so an integration that only listens for events never calls `/embed/enable`.

## Finished when

An integration is finished when every line below is **decided for this use case and the report to
the developer says how**. Nothing here says what to build; it says what must not be left undecided.
"Integrate viaSocket utilities" covers all of it for the actions and events in play, whether or not the
developer named each one.

- **Who connects.** Nobody: viaSocket utilities needs no sign-in, and `NoAuth` is sent wherever a call takes an `auth_id`.
- **Where each value comes from.** Every value a sample below writes as `<…>` — a field marked "list-options",
  or a choice between fixed values with no `default` — has one source, chosen for the use case and named in the
  report: fixed by you in code, only when one value serves every user of the product; chosen by your user once,
  on screen — a picker filled from their account, or a choice between the fixed values; or filled per run by your
  assistant, as a tool parameter. A value that depends on the user’s own account — their workspace, personal or
  shared, admin or not — is the user’s to choose, never fixed and never the first value because it came first.
  A free-text box for an id is a fourth choice, and one that needs a reason.
- **Every row of the table.** Each field of an action’s or trigger’s table is in the product — shown to the user with its
  `what it is` text as label and hint, or fixed in code with the reason in the report. A `required: yes` row
  is never dropped because its key looks technical; a boolean whose key says nothing is still a question
  the user answers.
- **Who picks the action.** You, in code; your user, from a list; or your assistant, from tool
  definitions — each one an action's schema below with the fixed fields removed. With the prebuilt UI's
  `chatbot: true` your user decides per flow which actions the assistant may use and which fields it fills.
- **Where it runs.** Actions from your backend on the app’s `script_id`; events through a `code`
  handler on viaSocket, with the subscription record saved. The browser never holds a `script_id`.
- **Proof.** `viasocket-check.mjs` (under "Prove it before you report") ran and its output is in the report; one real call
  was made and its actual response is there too; with a browser at hand, the Connect popup was opened and showed
  viaSocket utilities by name.

## Rules that are not negotiable

1. **The signing secret and the embed token are server-side only.** Sign the token on your
   backend; hand the frontend only what one popup needs.
2. **A `script_id` is a credential.** Anyone holding it can run that app as that user.
   Store it like a password and never ship it to the browser.
3. **Ids are fetched, never guessed.** Repository ids, channel ids, sheet ids — every one
   comes from `POST /embed/list-options`. A hardcoded id fails confusingly, not clearly.
4. **`existingFields` is not optional when a field depends on another.** Options are scoped
   by it; `{}` for a dependent field returns nothing useful.
5. **A nested key is addressed by its whole path.** `inputData` nests — `{ destination: {
   channel_id } }` — and the API addresses that field as `destination.channel_id`. So
   `fieldKey` is the **full dotted path**, never the leaf, and `existingFields` carries the
   value **nested exactly as inputData does**, never flattened:

   ```json
   { "fieldKey": "destination.thread_ts",
     "existingFields": { "destination": { "thread_channel_id": "C082WLRJLAA" } } }
   ```

   A leaf `fieldKey`, or a flat `"destination.thread_channel_id"` key in `existingFields`,
   matches no field: the call succeeds and returns nothing. Every field table below writes
   its keys in this full form, and the `inputData` sample beside each one shows the object
   those paths nest into. **Keys are case-sensitive and differ between actions of this app**
   (Google Sheets: `spreadsheet_Id` in one action, `spreadSheet_id` in another, `spreadsheet_id` in
   a third). A key from another action matches nothing, silently. Copy each key from the table
   of the action you are calling, character for character; never type one from memory. The
   parameter that carries it is `fieldKey` — not `blockKey`, not `field`.
6. **Normalise the list-options response.** Some fields wrap their list under `data.data`
   (with an `offset` you ignore); a plain field returns the array as `data`. Items are always
   `{ label, value }` — show the label, send the value. One helper, both shapes, no paging.
   A connection that cannot be read (revoked, or another user's `auth_id`) is answered with **200 and `success: true`**, the failure nested as `data.response.status` 400 and `data.response.data.message`. Treat that as the error it is; never render it as an empty list.
   A field marked **searchable** (`enableSearchApi` in the schema) takes what the user typed as
   `existingFields._searchText`, inside existingFields next to the dependency values. The field
   tables mark it.
7. **One `unique_identifier` per end user, forever.** Connections and subscriptions are
   isolated by it. Change it and the user appears to have lost their connection.
8. **A field of type `object` is not a single choice.** Fetch it like any other field —
   the response is the same `{ label, value }` list — then use *every* option’s `value` as a
   key, **verbatim**, and supply a value for each: `{ "<option value>": "<your value>" }`. The
   value is opaque: `name@longtext` is the whole key, however much it looks like a name plus a
   type. Never send the label, a lowercased label, or the value with a suffix removed.
9. **Enable only when you need actions, and never twice.** Subscribing to an event needs
   the connection and nothing more. Before enabling, look the flows up (see “Managing what
   a user already has”) — the `script_id` you want may already exist.
10. **A subscription needs a handler: `code`, a string of JavaScript we run on viaSocket’s
    servers each time the event fires.** It is what makes “when X happens in this app, do Y”
    work with no server of yours in the path. In scope there: `axios`, `fetch`, and `context`;
    the event is `context.req.body`. It stands alone: no `import`/`require`, nothing from this
    codebase; anything of yours it needs (a `script_id`, a picked id, an API key) is baked into
    the string when you subscribe. `webhook` is the edge case, not the default: pass it only
    when the product wants raw events pushed to a public endpoint of its own. Never both.
11. **Two ids, and the call names which.** The version id runs an action, lists options and
    subscribes; the `action_id` / `trigger_id` is for the connect popup, automations and the prebuilt UI. Both are
    printed under every action and trigger below.
12. **The `service_id` is `row29ruc9gs1`, used exactly so.** Never viaSocket utilities's name or slug in its place, never
    the id with a name joined on (`row29ruc9gs1_viasocketutilities`); an `auth_id` is one opaque value, passed whole.

**Two ids per action and trigger, and they look alike.** Every action has an `action_id` and an
`action_version_id`; every trigger a `trigger_id` and a `trigger_version_id`. Both are `row…` strings
and nothing tells them apart by eye. The catalog API and every app’s document name each one as the
call that takes it, so copy same-name to same-name and never the other.

| The call | Takes |
| --- | --- |
| Run an action, `list-options`, `subscribe-event` | `action_version_id` / `trigger_version_id` |
| An automation’s `trigger_id` and each step’s `action_id`; the prebuilt UI’s `open: { actionId }` / `{ triggerId }` and `filteredServices`; the connect popup’s `filteredActions` | `action_id` / `trigger_id` |

**A `service_id` is used exactly as returned.** It is the bare `row…` string the search, the app
list (`rowid`) and the catalog (`service.service_id`) give — `rowo0bqrhj5g` for Gmail, `rowbu58rc`
for Slack. Never build one: not the app’s name or slug (`gmail`), not the id with a name joined on
(`rowbu58rc_gmail`), not an id read off another value. An `auth_id` does end in `_<service_id>`
(`auth2FvZLyE0_rowo0bqrhj5g`); that is one opaque value — pass it whole, never split it, never
compose one. The popup, the enable call and the prebuilt UI reject anything else, some of them
silently: an unknown app, a blank screen, a 400.

## A test connection, while building

Running an action, fetching a trigger’s real event and proving the token all need a connection, and
only a person can make one: the app’s sign-in runs in a browser. Ask the developer once, early, and
read the `auth_id` back yourself; never ask them to paste ids.

1. Tell the developer: “Open https://flow.viasocket.com/integrations/62791/projC9zfc2g2/apps-api, choose viaSocket utilities, click
   Connect and sign in with a test account. Tell me when it shows an `auth_id`.” That page connects as the
   test user `apps-api-test-user` — the identifier shown at the top of it.
2. Sign an embed token for `unique_identifier` `apps-api-test-user` and call `GET https://flow-api.viasocket.com/embed/authentications`
   with it. The entry whose `id` ends in `_<service_id>` is that app’s connection, and its `id` is the `auth_id`.
3. With it: enable the app once for a `script_id`; run the action once against a test target (a test channel, a
   test sheet) and keep its real response — that, not the sample printed under the action, is what a later step
   maps from; fetch a trigger’s real event with the sample call.

The test connection is for building. Its `auth_id` and `script_id` never go into the product’s code or config;
the product’s users make their own through its Connect button.

## Environment

```bash
# Your org signing secret, from the viaSocket Setup page. Backend only.
VIASOCKET_EMBED_SECRET=...

# Fixed for this integration.
VIASOCKET_ORG_ID=62791
VIASOCKET_PROJECT_ID=projC9zfc2g2
VIASOCKET_API_URL=https://flow-api.viasocket.com
VIASOCKET_RUN_URL=https://flow.sokt.io
VIASOCKET_SERVICE_ID=row29ruc9gs1   # viaSocket utilities
```

## Calling it

One server-side module, no dependency beyond a JWT library. Every call except the connect popup goes through it,
and every example further down uses these function names.

```js
import jwt from 'jsonwebtoken'

const API = process.env.VIASOCKET_API_URL
const RUN = process.env.VIASOCKET_RUN_URL

/**
 * uniqueIdentifier is YOUR stable id for the signed-in end user (a user id, an email hash).
 * It is not a token: it becomes the unique_identifier claim of the embed token this signs.
 * Sign on demand, per request, on the server; never cache it in the browser.
 */
export function embedToken(uniqueIdentifier) {
  return jwt.sign(
    {
      org_id: process.env.VIASOCKET_ORG_ID,
      project_id: process.env.VIASOCKET_PROJECT_ID,
      unique_identifier: uniqueIdentifier
    },
    process.env.VIASOCKET_EMBED_SECRET
  )
}

async function call(path, uniqueIdentifier, body, method = "POST") {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", authorization: embedToken(uniqueIdentifier) },
    body: body === undefined ? "" : JSON.stringify(body)
  })
  const payload = await response.json()
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || `viaSocket ${path} failed with ${response.status}`)
  }
  return payload.data
}

/** Needed only to run actions. Once per (user, app) — store the script_id. */
export async function enableApp(uniqueIdentifier, authId, serviceId = process.env.VIASOCKET_SERVICE_ID) {
  const data = await call(`/embed/enable/${serviceId}/${authId}`, uniqueIdentifier)
  return data.script_id
}

/** Every flow this user has: one per enabled app, one per trigger subscription. */
export async function listUserFlows(uniqueIdentifier) {
  const response = await fetch(`${API}/projects/${process.env.VIASOCKET_PROJECT_ID}/integrations`, {
    headers: { authorization: embedToken(uniqueIdentifier) }
  })
  const payload = await response.json()
  return payload.data?.flows || []
}

/** The script_id of an app this user already enabled, or null. Saves enabling twice. */
export async function findEnabledApp(uniqueIdentifier, serviceId = process.env.VIASOCKET_SERVICE_ID) {
  const flows = await listUserFlows(uniqueIdentifier)
  return flows.find((flow) => flow.service_id === serviceId && flow.status === "active")?.id || null
}

/** status 0 deletes a flow (an enabled app, or a subscription), 2 pauses it, 1 resumes or restores it. */
export async function setFlowStatus(uniqueIdentifier, scriptId, status = 0) {
  return call(`/embed/updatestatus/${scriptId}?status=${status}`, uniqueIdentifier, undefined, "PUT")
}

/** Every app this user has connected — enough to render your own "connected accounts" screen. */
export async function listConnections(uniqueIdentifier) {
  return call("/embed/authentications", uniqueIdentifier, undefined, "GET")
}

/** Disconnects an app. Disable the flows built on it first, or they break. */
export async function revokeConnection(uniqueIdentifier, authId) {
  return call(`/embed/authentications/revoke/${authId}`, uniqueIdentifier, undefined, "DELETE")
}

/**
 * Step 3. The values one field accepts, scoped by what is already chosen.
 *
 * fieldKey is the field's full path ("destination.channel_id" for a nested one), and
 * existingFields is shaped like inputData — nested, never flattened to dotted keys.
 */
export async function listOptions(uniqueIdentifier, actionVersionId, fieldKey, existingFields = {}, authId, { searchText } = {}) {
  const data = await call(`/embed/list-options/${actionVersionId}`, uniqueIdentifier, {
    fieldKey,
    auth_id: authId,
    // Searchable fields take what the user typed inside existingFields, next to the dependency values.
    existingFields: searchText ? { ...existingFields, _searchText: searchText } : existingFields
  })
  // A connection that cannot be read (revoked, another user's auth_id) is answered with 200 and
  // success: true, the failure nested in data. Surface it; an empty picker hides the cause.
  if (data && !Array.isArray(data) && data.response && Number(data.response.status) >= 400) {
    throw new Error(data.response.data?.message || "list-options failed")
  }
  // Two shapes, one helper: some fields wrap the list under data.data. No paging: take the list.
  const options = Array.isArray(data) ? data : data.data
  return { options }
}

/** Step 4. No token — the script_id is the credential. */
export async function runAction(scriptId, actionVersionId, inputData) {
  const response = await fetch(`${RUN}/func/${scriptId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action_version_id: actionVersionId, inputData })
  })
  const payload = await response.json()
  // The run URL answers in viaSocket's envelope { success, data } — or with the action's own body at the
  // top level, which may itself carry a `success` key (Slack's "Find Public channel" returns
  // { success, channels }). It is the envelope only when `data` is present.
  const isEnvelope = payload && typeof payload === "object" && typeof payload.success === "boolean" && "data" in payload
  if (isEnvelope ? !payload.success : payload?.success === false) throw new Error(payload.message || payload.error?.message || "Action failed")
  return isEnvelope ? payload.data : payload
}

/**
 * Step 5. `delivery` is { code: script } — a handler we run per event (rule 10, Triggers) — or,
 * as the edge case, { webhook: url } — we POST raw events to a public URL of yours. One or the other.
 */
export async function subscribeEvent(uniqueIdentifier, triggerVersionId, authId, inputData, delivery, meta = {}) {
  const data = await call(`/embed/subscribe-event/${triggerVersionId}`, uniqueIdentifier, {
    auth_id: authId,
    inputData,
    ...delivery,
    meta
  })
  // data.script_id is the subscription; data.inputData.hookUrl is the hook we created.
  return data.script_id
}

export async function updateSubscription(uniqueIdentifier, subscriptionScriptId, changes) {
  return call(`/embed/update-subscribed-event/${subscriptionScriptId}`, uniqueIdentifier, changes, "PUT")
}
```

## Step 1 — no sign-in needed

viaSocket utilities needs no connection: no connect button, no popup, nothing for the user to grant and nothing
to store. Wherever a call takes an `auth_id` — enable, list-options, subscribe — the value is the
string `NoAuth`. What remains is the backend step, and only if the product runs its actions; enabling
is needed with `NoAuth` exactly as it is with a connection:

```js
const authId = 'NoAuth' // this app has no sign-in; the same value in every call
// Only if you are going to run actions — subscribing to events needs just the authId.
let scriptId = await findEnabledApp(uniqueIdentifier, 'row29ruc9gs1')
if (!scriptId) scriptId = await enableApp(uniqueIdentifier, authId)
// store scriptId against (uniqueIdentifier, "row29ruc9gs1")
```

## viaSocket utilities

- `service_id`: `row29ruc9gs1`
- icon: https://stuff.thingsofbrand.com/viasocket.com/images/img5_viasocket.svg
- auth: NoAuth
- 4 actions, 0 triggers

## How to render a picker for any field

This is the part that is not obvious. To show the user a dropdown of viaSocket utilities values —
repositories, channels, boards, spreadsheets — you do **not** need the action you intend to
run. You need *any* action or trigger that exposes that field, and you call list-options on
that one's `action_version_id`. The field key is the same wherever it appears.

This table gives the cheapest source for every fetchable field of this app: the action with
the fewest prerequisites. Use it to build pickers before you have decided which action the
user is ultimately running.

Every key below is the **full path**, which is exactly what `fieldKey` takes. Where one has a
dot in it the field lives inside an object, so its value is nested under that path in both
`existingFields` and `inputData`.

| field key | label | needs first | search | call list-options on | (that action) |
| --- | --- | --- | --- | --- | --- |
| `flowid` | Flow To Run | — | — | `rowglsmto1wh` | Flow in Flow |
| `inputbody` | Payload | `flowid` | — | `rowglsmto1wh` | Flow in Flow |

"searchable": the field has `enableSearchApi`; send what the user typed, debounced, as `existingFields._searchText` — inside existingFields, next to the dependency values. A new text starts a new list.

Worked example — a picker for `flowid`:

```js
// Flow in Flow is just the cheapest place this field appears.
const { options } = await listOptions(uniqueIdentifier, 'rowglsmto1wh', 'flowid', {}, authId)

// options is [{ label, value }] — render label, submit value.
renderSelect(options)
```

## Rendering a form for any action

Only when the end user configures an action themselves. A fixed feature needs a control only for
the values its sample writes as `<…>` — a picker from the field index above, or a choice between
fixed values — not a form. Every action and trigger below is described by the same
field schema, so one renderer serves all of them: give it an `action_version_id`, it draws the
form and produces `inputData`.

| column in the tables below | render as | behaviour |
| --- | --- | --- |
| type `string`, `number`, `date`, `html`, `markdown` | text input (number/date typed) | free text from your user |
| type `boolean` | yes / no | send `true` / `false` |
| type `dropdown` | single select | options from the `value comes from` column |
| type `multiselect` | multi select | send an array of values |
| type `object` | a card containing its child fields (the keys with a dot prefix) | nest the children under the parent key in `inputData` |
| type `dictionary` | key / value rows | send an object |
| type `aifield` | free text | a description the platform turns into structured input; send a string |
| `what it is` | the label and the hint | the first part is the label on the control, the rest its hint; `Yes = true` names the choices a user reads; `default` is the initial value. Every row is shown, or fixed in code with a reason — a `required: yes` row is never dropped because its key looks technical |
| `value comes from: one of …` | static options | those literal values; with no `default`, the sample writes the key as `<one of: …>` — a choice made before the call, the user’s when the right value depends on their account |
| `value comes from: list-options` | select that fetches on open | await listOptions(uniqueIdentifier, versionId, fieldKey, existingFields, authId); show `label`, send `value` |
| `list-options (searchable)` | the same, with a search box | debounce typing and send it as `existingFields._searchText`; a new text starts a new list |
| `needs first` / `list-options after X` | disabled until X has a value | put X's current value in `existingFields`, nested exactly as `inputData`; clear this field when X changes |
| `only applies when …` | hidden unless the condition holds | leave hidden fields out of `inputData` entirely |
| `after X has a value` | the form’s order: shown once X is filled | fill X first — it is the field this one depends on, usually a picker; in a complete `inputData` the key is present |
| `required: yes` | validation | block submit while empty and visible |

`fieldKey` for a fetch is always the full dotted path in the table. The result is the same
`inputData` shape as the sample under each action; submit it unchanged.

The complete recipe — the raw schema and where to get it, the eight rules, a framework-free
form engine and a React skin with paging and search — is its own document. Fetch it when you
build the form:

```http
GET https://flow.viasocket.com/documentation/form-renderer.md
```

This app's raw schema: `POST https://flow.sokt.io/func/scriK4LFg2kc` with `{"service_id":"row29ruc9gs1"}` → `{ service, actions, triggers }`, each action and trigger with its two ids and its `input_schema`.

## Actions

Run any of these with `runAction(scriptId, action_version_id, inputData)` — the `action_version_id` printed first under the action, never its `action_id`.

**What a call returns is known only by making it.** The samples below were written by each connector’s author, and some actions have none;
neither is a live response. Before any code reads a field of a result — a step mapping from `context.res`, a handler using a second
app’s return, the product storing an id — run the action once on the test connection (section “A test connection, while building”)
and map from what actually came back. A read action is safe to run as it is; a write action goes against a test target.

**A `<…>` in a sample is a value still owed, never one to send.** `<id from list-options>` is fetched; `<one of: …>` is a
choice between the fixed values in the table — the user’s, on screen, when the right value depends on their own account
(their workspace, personal or shared, admin or not); yours, in code, only when one value serves every user. A `default` in
the table is the form’s initial value, not that decision.


### Flow in Flow

- `action_version_id`: `rowglsmto1wh` — for the run call and `list-options`
- `action_id`: `row9rhy069oz` — for the connect popup's `filteredActions` (Step 1), an automation step’s `action_id` and the prebuilt UI’s `open: { actionId }`. Never in place of the version id above, nor the other way round
- Run another workflow from your current workflow
- fetch first: `flowid`, `inputbody`

| key | type | required | what it is | value comes from | only applies when |
| --- | --- | --- | --- | --- | --- |
| `flowid` | dropdown | yes | Flow To Run — Select the workflow you want to run. | list-options |  |
| `methodOfPayload` | dropdown | yes | Method to fill Payload — Key-Value Pair = "keyvalue", Bulk Insert = "bulk" — default "keyvalue" | one of "keyvalue", "bulk" |  |
| `inputbody` | object | no | Payload | list-options after flowid, one key per option: each option's value, verbatim | only when methodOfPayload = "keyvalue" |
| `bulkpayload` | string | yes | Payload | your user | applies when // eg:- name === 'john' methodOfPayload!=='keyvalue' |

```js
const result = await runAction(scriptId, 'rowglsmto1wh', {
  "flowid": "<id from list-options>",
  "methodOfPayload": "keyvalue",
  "inputbody": {
    "<option value, verbatim, e.g. name@longtext>": "<your value>"
  },
  "bulkpayload": "<bulkpayload>"
})
```

A sample of what this call returns, as the connector’s author wrote it; a live response can differ. Run the action once on the test connection before a later step maps from it:

```json
{
  "data": {
    "data": {
      "success": true
    },
    "message": "Queued",
    "flowHitId": "flh_sample"
  },
  "status": 200,
  "headers": {
    "date": "2026-03-07T09:00:00Z",
    "flowhitid": "flh_sample",
    "content-type": "application/json"
  },
  "statusText": "OK"
}
```

### Invoke Service Action Version

- `action_version_id`: `row2e9oin7g4` — for the run call and `list-options`
- `action_id`: `rowerx448b5g` — for the connect popup's `filteredActions` (Step 1), an automation step’s `action_id` and the prebuilt UI’s `open: { actionId }`. Never in place of the version id above, nor the other way round
- Invoke a specific action version using action_version_id and auth_id, sending parsed or raw JSON inputData.

| key | type | required | what it is | value comes from | only applies when |
| --- | --- | --- | --- | --- | --- |
| `action_version_id` | string | yes | Enter the action ID to invoke. | your user |  |
| `auth_id` | string | yes | Auth ID — Enter the auth ID for the function. | your user |  |
| `inputData` | string | yes | Input Data (JSON) — Enter the input data as a JSON string. It will be parsed into an object before the API call. | your user |  |

```js
const result = await runAction(scriptId, 'row2e9oin7g4', {
  "action_version_id": "<action_version_id>",
  "auth_id": "<auth_id>",
  "inputData": "<inputData>"
})
```

No sample of what this call returns is on record. Run it once on the test connection and map from the actual response; do not guess a shape.

### Pause Workflow

- `action_version_id`: `rowqahrvooxc` — for the run call and `list-options`
- `action_id`: `row6hurrxf00` — for the connect popup's `filteredActions` (Step 1), an automation step’s `action_id` and the prebuilt UI’s `open: { actionId }`. Never in place of the version id above, nor the other way round
- Pause workflow for X minutes

| key | type | required | what it is | value comes from | only applies when |
| --- | --- | --- | --- | --- | --- |
| `dGfEhUhQ` | aifield | yes | Enter Delay Statement Here, Minimum 1 minute. | your user |  |

```js
const result = await runAction(scriptId, 'rowqahrvooxc', {
  "dGfEhUhQ": "<dGfEhUhQ>"
})
```

No sample of what this call returns is on record. Run it once on the test connection and map from the actual response; do not guess a shape.

### Run AI Model

- `action_version_id`: `row9t37oaial` — for the run call and `list-options`
- `action_id`: `rowskkqydb6f` — for the connect popup's `filteredActions` (Step 1), an automation step’s `action_id` and the prebuilt UI’s `open: { actionId }`. Never in place of the version id above, nor the other way round
- Send a prompt and options to an AI model and receive text or JSON responses, images, model details, and usage cost.

| key | type | required | what it is | value comes from | only applies when |
| --- | --- | --- | --- | --- | --- |
| `threadid` | string | no | Conversation id — Enter a unique ID to help the AI recall past messages and keep the conversation connected. Example: For an account-based conversation, use an account-specific conversation ID to group all messages related to that user or session. | your user |  |
| `query` | string | yes | User message — Enter your message for the AI, whether it's a question, request, or command. | your user |  |
| `reasoning` | dropdown | no | Reasoning level — Choose how much reasoning the model should use. — Low = "low", Medium = "medium", High = "high" — default "medium" | one of "low", "medium", "high" |  |
| `prompt` | string | no | Prompt — Enter the system prompt to set guidelines for the AI agent to work on dynamic user agent | your user |  |
| `response_type` | dropdown | no | Response Type — If set to json_object AI will return a stringified json object in content. — default "text" | one of "text", "json_object" |  |
| `response_json_structure` | string | yes | The sample JSON required in the response | your user | only when response_type = "json_object" |

```js
const result = await runAction(scriptId, 'row9t37oaial', {
  "threadid": "<threadid>",
  "query": "<query>",
  "reasoning": "medium",
  "prompt": "<prompt>",
  "response_type": "text"
})
```

No sample of what this call returns is on record. Run it once on the test connection and map from the actual response; do not guess a shape.

## Managing what a user already has

All four are scoped to the `unique_identifier` in the token, so they answer for one end user.

| call | what it is for |
| --- | --- |
| `GET https://flow-api.viasocket.com/projects/projC9zfc2g2/integrations` | Every flow this user has. Match `service_id` to find an app they already enabled, and to recover a `script_id`. |
| `PUT https://flow-api.viasocket.com/embed/updatestatus/<script_id>?status=0` | Turn off an enabled app or a trigger subscription: `status=0` deletes it, `status=2` pauses it, `status=1` resumes or restores it. |
| `GET https://flow-api.viasocket.com/embed/authentications` | Every app this user has connected. |
| `DELETE https://flow-api.viasocket.com/embed/authentications/revoke/<auth_id>` | Disconnect an app. Disable its flows first. |

The flows list:

```json
{ "success": true, "data": { "flows": [
  {
    "title": "rowqm5xi2",
    "status": "active",
    "webhook": "https://flow.sokt.io/func/scriRx0PKDEG",
    "auth_id": "auth2c38gFVg_rowqm5xi2",
    "service_id": "rowqm5xi2",
    "id": "scriRx0PKDEG"
  }
] } }
```

`id` is the `script_id`. The list carries no `inputData` and no handler, so a subscription is not
identifiable from it alone: match `id` against the subscription records you saved (Triggers section).

The other two responses:

- `updatestatus` returns the **entire flow record** — its generated script, its whole
  `json_script`, its metadata. Ignore all of it and check `data.status`: `"0"` deleted,
  `"1"` active, `"2"` paused.
- `revoke` returns `{ "success": true, "message": "Successfully deleted authentication data",
  "data": [] }`. The empty array is normal; success is the signal.

## Prove it before you report

Reading code cannot show whether an id names a real app, whether a version id sits where the call takes the
`action_id`, or whether a viasocket URL was built by hand. A script can — no browser needed:

```bash
curl -fsSL https://flow.viasocket.com/viasocket-check.mjs -o viasocket-check.mjs
node viasocket-check.mjs src        # the folders holding the integration; no dependencies, Node 18+
```

It finds every viaSocket id and URL in the code and checks each against the live catalog; it reads no `.env`
file and prints no line of code. Fix every FAIL, keep it as a test (`npm test`, CI) so a later edit that swaps
an id fails there and not in front of a user, and paste its output in the report. With
`VIASOCKET_TEST_EMBED_TOKEN` set to a token signed for a test user it also proves the token.

Then make one real call — run the action; for an event, the sample call, then the event made to happen once —
and report what actually came back, not what the code should return. With a browser at hand, click Connect:
the popup shows viaSocket utilities's own name and its actions or consent screen; "Page not found", a blank page or
another app is a failure to report, not to work around.

Last, read your own diff for what no script sees, and answer each in the report: the Connect button carries
viaSocket utilities's icon and name; `closed` from the popup is treated as "nothing yet", not a result; every field key
was copied from the action's table, none typed from a label; the secret and every `script_id` are server-side only.

## When it goes wrong

| symptom | cause |
| --- | --- |
| 401 / invalid token | Signed with the wrong secret, or the payload is missing `org_id` / `project_id` / `unique_identifier`. |
| Empty option list | `existingFields` is missing something this field depends on, or the `auth_id` belongs to a different `unique_identifier`. |
| Empty option list on a nested field | `fieldKey` was the leaf instead of the full path, or `existingFields` was flattened to dotted keys instead of nested. Both match nothing, and neither errors. |
| A field is ignored, or the record is created empty | An option’s `value` was altered before being used as a key (`name` sent for `name@longtext`), or a key was typed from a label. Keys are each option’s `value`, verbatim. |
| Empty option list, key looks right | Its casing is from another action of this app (`spreadsheet_id` vs `spreadsheet_Id`), or the request said `blockKey` instead of `fieldKey`. Compare with this action’s table, character for character. |
| `options.map is not a function` | The wrapped shape (`data.data`) was not normalised. |
| Picker empty, response is 200 with `data.response.status` 400 | The connection cannot be read: revoked, or the `auth_id` belongs to another `unique_identifier`. The message is in `data.response.data.message`; reconnect the app. |
| App rejects the action | An id was hardcoded instead of fetched, or two mutually exclusive keys were both sent — see the "only applies when" column. |
| The connect popup says "Unknown app", or the listener gets `viasocket_connection_error` naming the id | The `serviceId` was not the bare `service_id` (`row29ruc9gs1`): viaSocket utilities's name, its slug, the id with a name joined on, or an id from another environment. Pass it exactly as this file prints it; `viasocket-check.mjs` catches this before a user does. |
| The popup shows "Page not found" | The popup was opened to a URL built by hand, not by `openViasocketConnection`. Load the connect script from the URL in Step 1 and let it open the popup; nothing else opens it. |
| A step or the product reads `undefined` from an action’s result | The response shape was taken from the sample, or guessed where there was none. Run the action once on the test connection and map from its actual response. |
| A handler reads `undefined` from the event | Its keys were guessed from the trigger’s name or another app’s sample. Run the sample call under Triggers for this connection and map from what it returns; drop `viasocket_help`. |
| The sample call answers `{ "success": true, "message": "No response" }` | Its `action_id` was the `trigger_version_id`. It takes the `trigger_id`. |
| Handler never runs | The subscription was created against a different `auth_id`, or `inputData` did not match the event (wrong label, wrong sheet). |
| Handler runs, the action inside it fails | The `script_id` baked into the handler belongs to another user, or that app was never enabled for this user; or the `inputData` keys do not match the other app’s document. Read the response `message`. |
| Someone asks for a webhook URL | Nobody needs one for “when X, do Y”: the handler does Y itself. A webhook is only for pushing raw events to a public endpoint the product chose to expose. |
| The same event fires twice | Subscribed twice for one user. Check the saved subscription record before subscribing; remove the duplicate with its `script_id`. |
| Connection appears lost | A different `unique_identifier` was used for the same end user. |
| Two script_ids for one app | `enableApp` ran without checking `findEnabledApp` first. |
