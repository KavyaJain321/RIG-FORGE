import type { Metadata } from 'next'

import ChatApp from '@/components/chat/ChatApp'

export const metadata: Metadata = { title: 'Messages' }

export default function MessagesPage() {
  return <ChatApp />
}
