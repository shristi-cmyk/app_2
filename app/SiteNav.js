'use client'
import { usePathname } from 'next/navigation'

// The owner tools' links. Hidden inside the EOD tool, which employees use without the owner password.
export default function SiteNav() {
  const path = usePathname() || ''
  if (path === '/eod' || path.startsWith('/eod/')) return null
  return (
    <nav style={{ display: 'flex', gap: 16, padding: '10px 16px', background: '#fff', borderBottom: '1px solid #e3e5e8' }}>
      <a href="/outreach">Partner Outreach</a>
      <a href="/">Invoice Mailer</a>
      <a href="/eod">EOD Reports</a>
    </nav>
  )
}
