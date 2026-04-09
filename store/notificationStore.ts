'use client'

import { create } from 'zustand'

// ─── Types ─────────────────────────────────────────────────────────────────

export type NotificationType =
  | 'TICKET_RAISED'
  | 'TICKET_ACCEPTED'
  | 'TICKET_COMPLETED'
  | 'TICKET_CANCELLED'
  | 'TASK_ASSIGNED'
  | 'TASK_DONE'
  | 'TASK_OVERDUE'
  | 'PROJECT_UPDATE'
  | 'PROJECT_ANNOUNCEMENT'
  | 'PROJECT_MEMBER_ADDED'
  | 'PROJECT_LEAD_ASSIGNED'
  | 'ONBOARDING_APPROVED'
  | 'ONBOARDING_PENDING'

export interface NotificationItem {
  id: string
  type: string
  title: string
  body: string
  read: boolean
  linkTo: string | null
  createdAt: Date
}

// ─── Store ─────────────────────────────────────────────────────────────────

interface NotificationState {
  notifications: NotificationItem[]
  unreadCount: number
  connected: boolean

  addNotification: (n: NotificationItem) => void
  setNotifications: (items: NotificationItem[]) => void
  setUnreadCount: (n: number) => void
  markRead: (id: string) => void
  markAllRead: () => void
  setConnected: (b: boolean) => void
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,
  connected: false,

  addNotification: (n) =>
    set((state) => {
      // Deduplicate — real-time events may arrive after a REST fetch
      const exists = state.notifications.some((item) => item.id === n.id)
      if (exists) return state

      const updated = [n, ...state.notifications]
      const unreadDelta = n.read ? 0 : 1

      return {
        notifications: updated,
        unreadCount: state.unreadCount + unreadDelta,
      }
    }),

  setNotifications: (items) =>
    set((state) => {
      // Merge with any live-received notifications not yet in the REST result
      const existingIds = new Set(items.map((i) => i.id))
      const liveOnly = state.notifications.filter((n) => !existingIds.has(n.id))
      const merged = [...liveOnly, ...items].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      const unreadCount = merged.filter((n) => !n.read).length
      return { notifications: merged, unreadCount }
    }),

  setUnreadCount: (n) => set({ unreadCount: n }),

  markRead: (id) =>
    set((state) => {
      const notifications = state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      )
      const unreadCount = Math.max(
        0,
        notifications.filter((n) => !n.read).length
      )
      return { notifications, unreadCount }
    }),

  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),

  setConnected: (b) => set({ connected: b }),
}))
