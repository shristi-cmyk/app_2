import { IDS, listOptions } from '../../../lib/viasocket.js'
import { UID } from '../../../lib/user.js'
import { readState } from '../../../lib/store.js'

export const dynamic = 'force-dynamic'

export async function GET(req) {
  const p = new URL(req.url).searchParams
  const kind = p.get('kind')
  const search = p.get('q') || undefined
  const s = readState()
  try {
    if (kind === 'spreadsheets') {
      return Response.json(await listOptions(UID, IDS.sheetsSpreadsheetPicker, 'spreadSheet_id', {}, s.auth.sheets, search))
    }
    if (kind === 'tabs') {
      return Response.json(await listOptions(UID, IDS.sheetsTabPicker, 'sheet_Id', { spreadsheet_Id: p.get('spreadsheet') }, s.auth.sheets))
    }
    if (kind === 'templates') {
      return Response.json(await listOptions(UID, IDS.docsFromTemplate, 'template_id', {}, s.auth.docs, search))
    }
    return Response.json({ error: 'unknown kind' }, { status: 400 })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
