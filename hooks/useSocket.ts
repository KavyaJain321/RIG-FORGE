'use client'

import { useEffect, useRef, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'

import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'
import { useToast } from '@/components/ui/Toast'
import type { NotificationItem } from '@/store/notificationStore'

// ─── Types ─────────────────────────────────────────────────────────────────

interface UseSocketReturn {
  connected: boolean
}

// ─── Toast type mapper ────────────────────────────────────────────────────

function toastTypeForNotification(type: string): 'error' | 'success' {
  if (type === 'BLOCKER_ESCALATED' || type === 'BLOCKER_RAISED') return 'error'
  return 'success'
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useSocket(): UseSocketReturn {
  const { user } = useAuthStore()
  const { addNotification, setUnreadCount, setConnected, connected } =
    useNotificationStore()
  const { addToast } = useToast()

  const socketRef           = useRef<Socket | null>(null)
  const reconnectAttempts   = useRef<number>(0)
  const pollingIntervalRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastPolledCount     = useRef<number>(0)
  const isMounted           = useRef<boolean>(true)

  // Stable ref wrappers so socket event callbacks always see the latest version
  // without triggering useCallback recreation loops.
  const addNotificationRef = useRef(addNotification)
  const addToastRef        = useRef(addToast)
  const setUnreadCountRef  = useRef(setUnreadCount)
  const setConnectedRef    = useRef(setConnected)

  useEffect(() => { addNotificationRef.current = addNotification }, [addNotification])
  useEffect(() => { addToastRef.current        = addToast        }, [addToast])
  useEffect(() => { setUnreadCountRef.current  = setUnreadCount  }, [setUnreadCount])
  useEffect(() => { setConnectedRef.current    = setConnected    }, [setConnected])

  // ─── Polling teardown ────────────────────────────────────────────────

  const clearPollingInterval = useCallback(() => {
    if (pollingIntervalRef.current !== null) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
  }, [])

  // ─── Polling fallback ────────────────────────────────────────────────

  const startPollingFallback = useCallback(() => {
    if (pollingIntervalRef.current !== null) return

    console.log('[useSocket] WebSocket failed — starting polling fallback (30s)')

    pollingIntervalRef.current = setInterval(() => {
      void (async () => {
        try {
          const res = await fetch('/api/notifications/count', {
            credentials: 'include',
          })
          if (!res.ok) return

          const json = (await res.json()) as { data: { unreadCount: number } }
          const newCount = json.data?.unreadCount ?? 0

          setUnreadCountRef.current(newCount)

          if (newCount > lastPolledCount.current) {
            const itemsRes = await fetch('/api/notifications?limit=5', {
              credentials: 'include',
            })
            if (itemsRes.ok) {
              const itemsJson = (await itemsRes.json()) as {
                data: { items: NotificationItem[] }
              }
              const items = itemsJson.data?.items ?? []
              items.forEach((n) => addNotificationRef.current(n))
            }
          }

          lastPolledCount.current = newCount
        } catch {
          // Network error during poll — silently skip
        }
      })()
    }, 30_000)
  }, []) // refs never change identity — no deps needed

  // ─── Reconnect handler ───────────────────────────────────────────────

  // Use a ref so initSocket's event closures always see the latest version.
  const handleReconnectRef = useRef<() => void>(() => undefined)

  // ─── initSocket ─────────────────────────────────────────────────────

  const initSocket = useCallback(async () => {
    if (!isMounted.current) return

    // Disconnect any stale socket before creating a new one
    if (socketRef.current) {
      socketRef.current.removeAllListeners()
      socketRef.current.disconnect()
      socketRef.current = null
    }

    // 1. Ping the Socket.io server-init route
    try {
      await fetch('/api/socket', { credentials: 'include' })
    } catch {
      console.warn('[useSocket] /api/socket init ping failed — continuing')
    }

    // 2. Fetch JWT string for WebSocket auth
    let token: string
    try {
      const tokenRes = await fetch('/api/auth/token', { credentials: 'include' })
      if (!tokenRes.ok) throw new Error(`Token fetch ${tokenRes.status}`)
      const tokenJson = (await tokenRes.json()) as { data: { token: string } }
      token = tokenJson.data?.token ?? ''
      if (!token) throw new Error('Empty token')
    } catch (err) {
      console.error('[useSocket] Auth token fetch failed:', err)
      startPollingFallback()
      return
    }

    if (!isMounted.current) return

    // 3. Create socket — manual reconnection
    const socket = io(window.location.origin, {
      path: '/api/socket',
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: false,
    })

    socketRef.current = socket

    // 4. Server confirms connection
    socket.on('connected', () => {
      console.log('[useSocket] ● Connected to real-time server')
      setConnectedRef.current(true)
      reconnectAttempts.current = 0
      clearPollingInterval()
    })

    // 5. Incoming notification
    socket.on('notification', (data: unknown) => {
      const n = data as NotificationItem
      addNotificationRef.current(n)
      addToastRef.current(toastTypeForNotification(n.type), n.title)
    })

    // 5b. Incoming thread message — broadcast to any mounted useThread hooks
    socket.on('new_message', (data: unknown) => {
      window.dispatchEvent(new CustomEvent('forge:new_message', { detail: data }))
    })

    // 6. Disconnect → attempt reconnect
    socket.on('disconnect', () => {
      console.warn('[useSocket] Disconnected')
      setConnectedRef.current(false)
      handleReconnectRef.current()
    })

    // 7. Connection error → attempt reconnect
    socket.on('connect_error', () => {
      handleReconnectRef.current()
    })
  }, [clearPollingInterval, startPollingFallback])

  // Keep handleReconnectRef pointing at fresh initSocket
  useEffect(() => {
    handleReconnectRef.current = () => {
      if (!isMounted.current) return
      reconnectAttempts.current += 1
      console.log(`[useSocket] Reconnect attempt ${reconnectAttempts.current}/3`)

      if (reconnectAttempts.current < 3) {
        setTimeout(() => { void initSocket() }, 5_000)
      } else {
        console.warn('[useSocket] Max attempts — polling fallback')
        startPollingFallback()
      }
    }
  }, [initSocket, startPollingFallback])

  // ─── Cleanup ────────────────────────────────────────────────────────

  const cleanupSocket = useCallback(() => {
    socketRef.current?.removeAllListeners()
    socketRef.current?.disconnect()
    socketRef.current = null
    clearPollingInterval()
    setConnectedRef.current(false)
  }, [clearPollingInterval])

  // ─── Lifecycle ──────────────────────────────────────────────────────

  useEffect(() => {
    isMounted.current = true

    if (user) {
      void initSocket()
    }

    return () => {
      isMounted.current = false
      cleanupSocket()
    }
    // Depend on user identity only — re-init socket only when user changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  return { connected }
}
