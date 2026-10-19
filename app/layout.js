export const metadata = { title: 'viaSocket Tools' }

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f6f7f9', color: '#1a1d21' }}>
        <nav style={{ display: 'flex', gap: 16, padding: '10px 16px', background: '#fff', borderBottom: '1px solid #e3e5e8' }}>
          <a href="/outreach">Partner Outreach</a>
          <a href="/">Invoice Mailer</a>
        </nav>
        {children}
      </body>
    </html>
  )
}
