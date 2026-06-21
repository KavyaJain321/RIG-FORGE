'use client'

import { useEffect } from 'react'

// Registers the service worker so Rig Forge is installable + can receive Web Push.
// No-op on browsers without SW support or when serving over plain HTTP (non-localhost).
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('[pwa] service worker registration failed', err)
      })
    }
    if (document.readyState === 'complete') onLoad()
    else window.addEventListener('load', onLoad, { once: true })
  }, [])
  return null
}
