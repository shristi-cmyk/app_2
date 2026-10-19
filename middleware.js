import { NextResponse } from 'next/server'

// Simple password gate. The embed token and every viaSocket call act as "owner", so the app must not be public.
export function middleware(req) {
  const password = process.env.APP_PASSWORD
  if (!password) {
    return new NextResponse('Set APP_PASSWORD to use this app.', { status: 503 })
  }
  const header = req.headers.get('authorization') || ''
  const [scheme, encoded] = header.split(' ')
  if (scheme === 'Basic' && encoded) {
    const decoded = atob(encoded)
    if (decoded.slice(decoded.indexOf(':') + 1) === password) return NextResponse.next()
  }
  return new NextResponse('Login required', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Invoice Mailer"' } })
}
