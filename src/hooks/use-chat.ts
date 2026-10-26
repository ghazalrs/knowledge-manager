import { useRef, useState } from 'react'
import { requestChatReply } from '@/lib/chat-api'
import type { ChatAttachment, ChatMessage } from '@/types/chat'

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const currentMessages = useRef<ChatMessage[]>([])
  const inFlight = useRef(false)

  async function getReply(conversation: ChatMessage[]) {
    if (inFlight.current) return
    inFlight.current = true
    setSending(true)
    setError('')
    try {
      const context = conversation.filter((message) => message.content.trim()).map(({ role, content }) => ({ role, content }))
      const reply = await requestChatReply(context)
      const next: ChatMessage[] = [...currentMessages.current, {
        id: crypto.randomUUID(), role: 'assistant', content: reply.content, attachments: [],
      }]
      currentMessages.current = next
      setMessages(next)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not get a reply. Please retry.')
    } finally {
      inFlight.current = false
      setSending(false)
    }
  }

  function sendMessage() {
    const content = draft.trim()
    if (inFlight.current || (!content && attachments.length === 0)) return
    const next: ChatMessage[] = [...currentMessages.current, { id: crypto.randomUUID(), role: 'user', content, attachments }]
    currentMessages.current = next
    setMessages(next)
    setDraft('')
    setAttachments([])
    if (content) void getReply(next)
  }

  return {
    messages, draft, attachments, sending, error, setDraft, sendMessage,
    addAttachments: (files: File[]) => setAttachments((current) => [...current, ...files.map((file) => ({ id: crypto.randomUUID(), file }))]),
    removeAttachment: (id: string) => setAttachments((current) => current.filter((attachment) => attachment.id !== id)),
    retry: () => { void getReply(currentMessages.current) },
  }
}
