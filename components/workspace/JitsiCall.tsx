'use client'

import { useEffect, useRef } from 'react'

type JitsiApi = { dispose: () => void; addEventListener: (event: string, cb: () => void) => void }

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
      reject(new Error('Failed to load Jitsi'))
    }
    document.body.appendChild(s)
  })
  return loadPromise
}

// Embeds a live Jitsi call inside RF (no new tab). meet.jit.si is the free public
// instance — no account needed; anyone with the same room joins the same call.
export default function JitsiCall({ room, displayName, onLeave }: { room: string; displayName: string; onLeave: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<JitsiApi | null>(null)
  const onLeaveRef = useRef(onLeave)
  onLeaveRef.current = onLeave
  const nameRef = useRef(displayName)
  nameRef.current = displayName

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
          userInfo: { displayName: nameRef.current },
          configOverwrite: { prejoinPageEnabled: false },
        })
        apiRef.current = api
        api.addEventListener('readyToClose', () => onLeaveRef.current())
      } catch (err) {
        console.error('[jitsi] init failed', err)
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
