import { create } from 'zustand'
import type { MessageResponse } from '@/components/thread/types'

interface MessageStoreState {
  incoming: MessageResponse[]
  push: (m: MessageResponse) => void
  remove: (id: string) => void
}

export const useMessageStore = create<MessageStoreState>((set) => ({
  incoming: [],
  push: (m) =>
    set((state) => ({
      // Keep at most 200 entries to prevent unbounded growth
      incoming: [...state.incoming.slice(-199), m],
    })),
  remove: (id) =>
    set((state) => ({
      incoming: state.incoming.filter((msg) => msg.id !== id),
    })),
}))
