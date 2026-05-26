'use client'

import ReactMarkdown from 'react-markdown'
import type { ChatMessage } from '@/store/assistantStore'
import ActionCard from './ActionCard'

export default function Message({
  msg,
  conversationId,
}: {
  msg: ChatMessage
  conversationId: string | null
}) {
  const isUser = msg.role === 'user'

  return (
    <div className={['flex flex-col', isUser ? 'items-end' : 'items-start'].join(' ')}>
      <div
        className={[
          'max-w-[85%] px-4 py-2.5 text-sm rounded-2xl',
          isUser
            ? 'bg-[#1A1A1A] text-white rounded-br-md'
            : 'bg-[#F2F2EE] text-[#1A1A1A] rounded-bl-md border border-black/5',
        ].join(' ')}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.content}</p>
        ) : (
          <div className="prose prose-sm max-w-none prose-headings:font-semibold prose-headings:text-[#1A1A1A] prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-code:text-[#1A1A1A] prose-code:bg-black/5 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-pre:bg-[#1A1A1A] prose-pre:text-[#FAFAFA] prose-strong:text-[#1A1A1A]">
            <ReactMarkdown>{msg.content}</ReactMarkdown>
          </div>
        )}
      </div>

      {/* Footer meta — only for assistant messages */}
      {!isUser && (msg.provider || msg.cached || msg.fallback) && (
        <div className="flex items-center gap-2 mt-1 px-1 font-mono text-[10px] text-[#999999] tracking-wide">
          {msg.cached && <span className="text-[#888]">cached</span>}
          {msg.fallback && <span className="text-amber-600">fallback</span>}
          {msg.provider && !msg.cached && msg.provider !== 'cache' && (
            <span>via {msg.provider}</span>
          )}
        </div>
      )}

      {/* Inline confirmation cards for any proposed write actions */}
      {!isUser && msg.pendingActions && msg.pendingActions.length > 0 && (
        <div className="w-full max-w-[85%] flex flex-col gap-1.5">
          {msg.pendingActions.map((action) => (
            <ActionCard
              key={action.actionId}
              messageId={msg.id}
              action={action}
              conversationId={conversationId}
            />
          ))}
        </div>
      )}
    </div>
  )
}
