import { importFromSheet } from '../../../../lib/outreach/service.js'

// Body: { kind: 'apps' | 'pipeline', spreadsheetId, sheetId, label }
export async function POST(req) {
  const { kind, spreadsheetId, sheetId, label } = await req.json()
  if (!['apps', 'pipeline'].includes(kind) || !spreadsheetId || !sheetId) {
    return Response.json({ error: 'Pick a spreadsheet and a tab' }, { status: 400 })
  }
  try {
    return Response.json(await importFromSheet(kind, { spreadsheetId, sheetId, label }))
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 })
  }
}
