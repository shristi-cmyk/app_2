import { route, body } from '../../../../lib/eod/http.js'
import { requireRole, HttpError } from '../../../../lib/eod/auth.js'
import { audit, db } from '../../../../lib/eod/db.js'
import { IDS } from '../../../../lib/eod/config.js'
import { workspaceToken, connectionStatus, saveConnection, listOptions, connection } from '../../../../lib/eod/vs.js'
import { readHeaders } from '../../../../lib/eod/sheet.js'

export const dynamic = 'force-dynamic'

// Admin only. The admin connects Slack and Google Sheets once for the whole company (sponsored).
export const GET = route(async (req) => {
  requireRole(req, 'admin')
  const p = new URL(req.url).searchParams
  const view = p.get('view')
  // The browser gets the workspace token only to open the connect popup and mount the prebuilt UI.
  if (view === 'token') return Response.json({ token: workspaceToken() })
  if (view === 'status') return Response.json(await connectionStatus())
  if (view === 'options') {
    const kind = p.get('kind')
    const q = p.get('q') || undefined
    if (kind === 'spreadsheets') return Response.json(await listOptions(IDS.sheetsSpreadsheetPicker, 'spreadSheet_id', {}, connection('sheets').authId, q))
    if (kind === 'tabs') return Response.json(await listOptions(IDS.sheetsTabPicker, 'sheet_id', { spreadsheet_id: p.get('spreadsheet') }, connection('sheets').authId))
    if (kind === 'headers') return Response.json((await readHeaders(p.get('spreadsheet'), p.get('tab'))).map((h) => ({ label: h, value: h })))
    if (kind === 'channels') return Response.json(await listOptions(IDS.slackSendMessage, 'destination.channel_id', { destination: { messageto: 'channel' } }, connection('slack').authId))
    if (kind === 'users') return Response.json(await listOptions(IDS.slackSendDm, 'userId', {}, connection('slack').authId))
    throw new HttpError(400, 'Unknown options kind')
  }
  throw new HttpError(400, 'Unknown view')
})

export const POST = route(async (req) => {
  const me = requireRole(req, 'admin')
  const b = await body(req)
  if (!['slack', 'sheets'].includes(b.app) || !b.authId) throw new HttpError(400, 'bad request')
  await saveConnection(b.app, String(b.authId))
  audit(me, 'integration.connected', { app: b.app })
  return Response.json({ ok: true, connectedAt: db().connections[b.app].connectedAt })
})
