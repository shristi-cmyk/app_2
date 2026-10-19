import SiteNav from './SiteNav.js'

export const metadata = { title: 'viaSocket Tools' }

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f6f7f9', color: '#1a1d21' }}>
        <SiteNav />
        {children}
      </body>
    </html>
  )
}
