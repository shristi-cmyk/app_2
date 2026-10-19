import { parseApps, parsePipeline } from '../../../../lib/outreach/sheets.js'
import { importApps, importPipeline } from '../../../../lib/outreach/service.js'

// Body: CSV text exported from Google Sheets (File → Download → CSV). ?kind=apps|pipeline
export async function POST(req) {
  const kind = new URL(req.url).searchParams.get('kind')
  try {
    const text = await req.text()
    if (kind === 'apps') return Response.json(importApps(parseApps(text)))
    if (kind === 'pipeline') return Response.json(importPipeline(parsePipeline(text)))
    return Response.json({ error: 'kind must be apps or pipeline' }, { status: 400 })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 })
  }
}
