'use client'

import { create } from 'zustand'

// ─── Types ─────────────────────────────────────────────────────────────────

export type NotificationType =
  | 'WELCOME'
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

  addNotification:     (n: NotificationItem) => void
  setNotifications:    (items: NotificationItem[]) => void
  setUnreadCount:      (n: number) => void
  markRead:            (id: string) => void
  markAllRead:         () => void
  removeNotification:  (id: string) => void
  removeNotifications: (ids: string[]) => void
  setConnected:        (b: boolean) => void
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,
  connected: false,

  addNotification: (n) =>
    set((state) => {
      const exists = state.notifications.some((item) => item.id === n.id)
      if (exists) return state
      const updated = [n, ...state.notifications]
      return {
        notifications: updated,
        unreadCount: state.unreadCount + (n.read ? 0 : 1),
      }
    }),

  setNotifications: (items) =>
    set((state) => {
      const existingIds = new Set(items.map((i) => i.id))
      const liveOnly = state.notifications.filter((n) => !existingIds.has(n.id))
      const merged = [...liveOnly, ...items].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      return { notifications: merged, unreadCount: merged.filter((n) => !n.read).length }
    }),

  setUnreadCount: (n) => set({ unreadCount: n }),

  markRead: (id) =>
    set((state) => {
      const notifications = state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      )
      return { notifications, unreadCount: notifications.filter((n) => !n.read).length }
    }),

  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),

  removeNotification: (id) =>
    set((state) => {
      const notifications = state.notifications.filter((n) => n.id !== id)
      return { notifications, unreadCount: notifications.filter((n) => !n.read).length }
    }),

  removeNotifications: (ids) =>
    set((state) => {
      const set_ = new Set(ids)
      const notifications = state.notifications.filter((n) => !set_.has(n.id))
      return { notifications, unreadCount: notifications.filter((n) => !n.read).length }
    }),

  setConnected: (b) => set({ connected: b }),
}))
