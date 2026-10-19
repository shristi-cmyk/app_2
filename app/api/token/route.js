import { embedToken } from '../../../lib/viasocket.js'
import { UID } from '../../../lib/user.js'

export const dynamic = 'force-dynamic'

// The browser gets a token only to open the connect popup.
export async function GET() {
  return new Response(embedToken(UID))
}
