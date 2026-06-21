import type { Metadata } from 'next'
import { Bodoni_Moda, Outfit } from 'next/font/google'
import './globals.css'
import OfflineBanner from '@/components/shared/OfflineBanner'

// ── Global fonts (loaded on every page) ─────────────────────────────────────
// Only load what the app shell actually needs. Instrument Serif, Inter, and
// Playfair Display are exclusively used by the landing page (app/page.tsx)
// and are now scoped there. Loading 5 font families globally was costing
// ~3 extra network requests on every dashboard page load for zero benefit.

const display = Bodoni_Moda({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400', '500', '600', '700', '800', '900'],
  style: ['normal', 'italic'],
  display: 'swap',
})

const sans = Outfit({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['300', '400', '500', '600'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Rig Forge',
  description: 'Internal employee monitoring and project tracking platform',
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        {/* Set theme class before paint to avoid a flash of the wrong theme. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');if(t==='dark'){document.documentElement.classList.add('dark')}}catch(e){}})();",
          }}
        />
      </head>
      <body
        className={`${sans.variable} ${display.variable} bg-background-primary text-text-primary min-h-screen antialiased`}
      >
        <OfflineBanner />
        {children}
      </body>
    </html>
  )
}
