'use client'

import { useEffect, useRef } from 'react'

import { APP_NAME_UPPER as BRAND } from '@/lib/branding'

type JitsiApi = {
  dispose: () => void
  addEventListener: (event: string, cb: () => void) => void
  executeCommand: (command: string, ...args: unknown[]) => void
}

declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (domain: string, options: Record<string, unknown>) => JitsiApi
  }
}

let loadPromise: Promise<void> | null = null
function loadJitsiScript(): Promise<void> {
  if (typeof window !== 'undefined' && window.JitsiMeetExternalAPI) return Promise.resolve()
  if (loadPromise) return loadPromise
  loadPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://meet.jit.si/external_api.js'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      loadPromise = null
      reject(new Error('Failed to load video'))
    }
    document.body.appendChild(s)
  })
  return loadPromise
}

// Embeds a live call inside RF. The user joins instantly with their RF identity
// (name + email + avatar) — no prejoin/login screen — and the provider branding
// is hidden so it reads as RIG FORGE.
export default function JitsiCall({
  room,
  displayName,
  email,
  avatarUrl,
  onLeave,
}: {
  room: string
  displayName: string
  email?: string | null
  avatarUrl?: string | null
  onLeave: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<JitsiApi | null>(null)
  const onLeaveRef = useRef(onLeave)
  onLeaveRef.current = onLeave
  const nameRef = useRef(displayName)
  nameRef.current = displayName
  const emailRef = useRef(email)
  emailRef.current = email
  const avatarRef = useRef(avatarUrl)
  avatarRef.current = avatarUrl

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        await loadJitsiScript()
        if (cancelled || !containerRef.current || !window.JitsiMeetExternalAPI) return
        const api = new window.JitsiMeetExternalAPI('meet.jit.si', {
          roomName: room,
          parentNode: containerRef.current,
          width: '100%',
          height: '100%',
          userInfo: { displayName: nameRef.current, email: emailRef.current || undefined },
          configOverwrite: {
            // Drop straight into the call with the RF identity — no name/login screen.
            prejoinPageEnabled: false,
            prejoinConfig: { enabled: false },
            disableDeepLinking: true,
            disableProfile: true,
            disableThirdPartyRequests: true,
          },
          interfaceConfigOverwrite: {
            // Hide the provider's logos / watermarks / promos so it reads as RF.
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            SHOW_BRAND_WATERMARK: false,
            SHOW_POWERED_BY: false,
            JITSI_WATERMARK_LINK: '',
            BRAND_WATERMARK_LINK: '',
            HIDE_DEEP_LINKING_LOGO: true,
            DEFAULT_LOGO_URL: '',
            DEFAULT_WELCOME_PAGE_LOGO_URL: '',
            MOBILE_APP_PROMO: false,
            APP_NAME: BRAND,
            NATIVE_APP_NAME: BRAND,
            PROVIDER_NAME: BRAND,
          },
        })
        apiRef.current = api
        api.addEventListener('readyToClose', () => onLeaveRef.current())
        api.addEventListener('videoConferenceJoined', () => {
          try {
            api.executeCommand('displayName', nameRef.current)
            if (avatarRef.current) api.executeCommand('avatarUrl', avatarRef.current)
          } catch {
            /* ignore */
          }
        })
      } catch (err) {
        console.error('[call] init failed', err)
      }
    })()
    return () => {
      cancelled = true
      try {
        apiRef.current?.dispose()
      } catch {
        /* ignore */
      }
      apiRef.current = null
    }
  }, [room])

  return <div ref={containerRef} className="w-full h-full" />
}
