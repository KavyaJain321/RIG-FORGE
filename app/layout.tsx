import type { Metadata } from 'next'
import { Bodoni_Moda, Outfit, Instrument_Serif, Inter, Playfair_Display } from 'next/font/google'
import './globals.css'
import OfflineBanner from '@/components/shared/OfflineBanner'

const display = Bodoni_Moda({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400', '500', '600', '700', '800', '900'],
  style: ['normal', 'italic'],
})

const sans = Outfit({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['300', '400', '500', '600'],
})

const instrument = Instrument_Serif({
  subsets: ['latin'],
  variable: '--font-instrument',
  weight: ['400'],
  style: ['normal', 'italic'],
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['300', '400', '500', '600'],
})

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  weight: ['400', '700', '900'],
  style: ['normal', 'italic'],
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
      <body
        className={`${sans.variable} ${display.variable} ${instrument.variable} ${inter.variable} ${playfair.variable} bg-background-primary text-text-primary min-h-screen antialiased`}
      >
        <OfflineBanner />
        {children}
      </body>
    </html>
  )
}
