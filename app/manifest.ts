import type { MetadataRoute } from 'next'

// Web App Manifest — served at /manifest.webmanifest. Makes Rig Forge installable
// as a PWA (home-screen icon, standalone window) so the chat feels app-native.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Rig Forge',
    short_name: 'RigForge',
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
