// EOD tool configuration that comes from the environment. Everything here is server-only.

// The EOD tool has its own viaSocket embed (org 4160), separate from the one the other tools use.
export const VS = {
  orgId: process.env.EOD_VIASOCKET_ORG_ID,
  projectId: process.env.EOD_VIASOCKET_PROJECT_ID,
  secret: process.env.EOD_VIASOCKET_EMBED_SECRET,
  secretName: 'EOD_VIASOCKET_EMBED_SECRET'
}

// Sponsored connections: the admin connects Slack and Google Sheets once, under this one company-level
// identity. Employees never connect anything and never receive an embed token.
// One stable value forever: changing it makes the existing connections and flows disappear from the app.
export const WORKSPACE_UID = process.env.EOD_WORKSPACE_UID || 'eod-workspace'

export const SLACK = {
  serviceId: 'rowbu58rc',
  name: 'Slack',
  icon: 'https://stuff.thingsofbrand.com/slack.com/images/img668216333e_slack.jpg',
  // action_ids for the connect popup: Send Message, Send Direct Message
  filteredActions: ['row1jrbor', 'rowovgwtt9u4']
}

export const SHEETS = {
  serviceId: 'rowqm5xi2',
  name: 'Google Sheets',
  icon: 'https://stuff.thingsofbrand.com/google.com/images/img4_googlesheet.png',
  // action_ids for the connect popup: Add Multiple Rows, List Rows in Sheet, List Spreadsheet Tabs, Update Sheet Name (tab picker)
  filteredActions: ['rowfudy5tu2q', 'rowlpijbo5k1', 'rowtc0ud5uci', 'rowaya0i80ed']
}

// Version ids (run / list-options), copied from each app's document.
export const IDS = {
  slackSendMessage: 'rowj2u3wc8h5', // Send Message: destination.channel_id / destination.userId pickers
  slackSendDm: 'rowa5mg9fywy', // Send Direct Message: userId picker
  sheetsAddRows: 'rowdd8u5lg1k', // Add Multiple Rows
  sheetsListRows: 'rowyu1mevdtq', // List Rows in Sheet
  sheetsSpreadsheetPicker: 'rowxwbos3gky', // List Spreadsheet Tabs -> spreadSheet_id
  sheetsTabPicker: 'row0niyp8eqe' // Update Sheet Name -> sheet_id (needs spreadsheet_id)
}

// Built-in automation ids (viaSocket skill, Automations).
export const AUTOMATION = {
  create: 'scrisgf5H0hN',
  trigger: 'scrij2DSRMlP',
  steps: 'scrigkyMNOEC',
  read: 'scriiZYPU6I3'
}

export const RUN_URL = 'https://flow.sokt.io/func/'

export const ROLES = ['employee', 'tl', 'admin']
