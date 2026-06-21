import type { MetadataRoute } from 'next'

import { APP_NAME, APP_SHORT } from '@/lib/branding'

// Web App Manifest — served at /manifest.webmanifest. Makes the app installable
// as a PWA (home-screen icon, standalone window) so the chat feels app-native.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_SHORT,
    description: 'Team chat, projects, and the Forgie assistant — all in one place.',
    start_url: '/dashboard/messages',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#3F7A0A',
    orientation: 'portrait',
    icons: [
      { src: '/logo.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/logo.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'maskable' },
      { src: '/logo.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  }
}
