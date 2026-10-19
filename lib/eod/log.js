// Operational log lines: event names and ids only. Never entry text, tokens, auth_ids or script_ids.
export function log(event, fields = {}) {
  console.log(JSON.stringify({ at: new Date().toISOString(), tool: 'eod', event, ...fields }))
}
