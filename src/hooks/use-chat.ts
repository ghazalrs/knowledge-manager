import { useCallback, useEffect, useRef, useState } from 'react'
import { createConversation, deleteConversation, renameConversation, loadChatHistory, loadConversations, requestChatReply, resolveNoteProposal } from '@/lib/chat-api'
import type { ChatAttachment, ChatMessage, ChatMode, Conversation } from '@/types/chat'

type PendingMessage = { id: string; content: string; mode: ChatMode }
type ChatSession = {
  messages: ChatMessage[]
  draft: string
  attachments: ChatAttachment[]
  sending: boolean
  error: string
  loading: boolean
  loadError: string
  loaded: boolean
  persisted: boolean
  pending: PendingMessage | null
  mode: ChatMode
}

const emptySession = (): ChatSession => ({
  messages: [], draft: '', attachments: [], sending: false, error: '', loading: false, loadError: '', loaded: true, persisted: false, pending: null, mode: 'ask',
})

function mergeConversations(current: Conversation[], incoming: Conversation[]) {
  const combined = new Map(current.map((conversation) => [conversation.id, conversation]))
  for (const conversation of incoming) combined.set(conversation.id, conversation)
  return [...combined.values()].sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
}

export function useChat() {
  const [activeConversationId, setActiveConversationId] = useState<string>(() => crypto.randomUUID())
  const activeId = useRef(activeConversationId)
  const [sessions, setSessions] = useState<Record<string, ChatSession>>({})
  const currentSessions = useRef<Record<string, ChatSession>>({})
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [conversationsLoading, setConversationsLoading] = useState(true)
  const [conversationsError, setConversationsError] = useState('')
  const [listAttempt, setListAttempt] = useState(0)
  const listVersion = useRef(0)
  const deletedIds = useRef(new Set<string>())
  const [chatMutationError, setChatMutationError] = useState('')

  useEffect(() => {
    let cancelled = false
    const version = ++listVersion.current
    loadConversations().then((saved) => {
      if (cancelled || version !== listVersion.current) return
      setConversations((current) => mergeConversations(current, saved).filter((item) => !deletedIds.current.has(item.id)))
      setConversationsError('')
      setConversationsLoading(false)
    }).catch(() => {
      if (cancelled || version !== listVersion.current) return
      setConversationsError('Could not load saved conversations. Please retry.')
      setConversationsLoading(false)
    })
    return () => { cancelled = true }
  }, [listAttempt])

  const refreshConversations = useCallback(async () => {
    const version = ++listVersion.current
    try {
      const saved = await loadConversations()
      if (version !== listVersion.current) return
      setConversations((current) => mergeConversations(current, saved).filter((item) => !deletedIds.current.has(item.id)))
      setConversationsError('')
    } catch {
      if (version === listVersion.current) setConversationsError('Could not update saved conversations. Please retry.')
    } finally {
      if (version === listVersion.current) setConversationsLoading(false)
    }
  }, [])

  const titlePending = conversations.some((item) => item.titleState === 'pending')
  useEffect(() => {
    if (!titlePending) return
    const timer = window.setInterval(() => { void refreshConversations() }, 1500)
    return () => window.clearInterval(timer)
  }, [titlePending, refreshConversations])

  function updateSession(id: string, update: (session: ChatSession) => ChatSession) {
    if (deletedIds.current.has(id)) return
    const next = { ...currentSessions.current, [id]: update(currentSessions.current[id] ?? emptySession()) }
    currentSessions.current = next
    setSessions(next)
  }

  async function loadConversation(id: string, force = false) {
    const cached = currentSessions.current[id]
    if (cached?.loading || (cached?.loaded && !force)) return
    updateSession(id, (session) => ({ ...session, loading: true, loadError: '', loaded: false }))
    try {
      const history = await loadChatHistory(id)
      const last = history.at(-1)
      updateSession(id, (session) => ({
        ...session, messages: history.map((message) => ({ ...message, attachments: [] })),
        loading: false, loaded: true, persisted: true,
        mode: last?.mode ?? 'ask',
        pending: last?.role === 'user' ? { id: last.id, content: last.content, mode: last.mode ?? 'ask' } : null,
        error: last?.role === 'user' ? 'This message has no saved reply yet. Retry to continue.' : '',
      }))
      void refreshConversations()
    } catch {
      updateSession(id, (session) => ({ ...session, loading: false, loadError: 'Could not load this conversation. Check the local server and retry.' }))
    }
  }

  async function getReply(id: string, message: PendingMessage) {
    const session = currentSessions.current[id] ?? emptySession()
    if (session.sending || session.loading || session.loadError) return
    updateSession(id, (current) => ({ ...current, pending: message, sending: true, error: '' }))
    try {
      if (!session.persisted) {
        const conversation = await createConversation(id)
        if (deletedIds.current.has(id)) return
        updateSession(id, (current) => ({ ...current, persisted: true }))
        const firstText = currentSessions.current[id]?.messages.find((item) => item.role === 'user' && item.content.trim())?.content
        const title = firstText?.replace(/\s+/g, ' ').trim().slice(0, 80) || conversation.title
        setConversations((current) => [
          ...current.filter((item) => item.id !== id), { ...conversation, title },
        ].sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id)))
      }
      const reply = await requestChatReply({ ...message, conversationId: id })
      // Always update the originating chat, even if the user has switched views.
      updateSession(id, (current) => ({
        ...current, pending: null,
        messages: current.messages.some((item) => item.id === reply.id) ? current.messages : [...current.messages, { ...reply, attachments: [] }],
      }))
    } catch (failure) {
      updateSession(id, (current) => ({ ...current, error: failure instanceof Error ? failure.message : 'Could not get a reply. Please retry.' }))
    } finally {
      updateSession(id, (current) => ({ ...current, sending: false }))
      void refreshConversations()
    }
  }

  function sendMessage() {
    const id = activeId.current
    const session = currentSessions.current[id] ?? emptySession()
    const content = session.draft.trim()
    if (session.loading || session.loadError || session.sending || (!content && session.attachments.length === 0)) return
    const message: ChatMessage = { id: crypto.randomUUID(), role: 'user', content, attachments: session.attachments, mode: session.mode }
    updateSession(id, (current) => ({ ...current, messages: [...current.messages, message], draft: '', attachments: [] }))
    if (content) void getReply(id, { id: message.id, content, mode: session.mode })
  }

  function activate(id: string) {
    activeId.current = id
    setActiveConversationId(id)
  }

  async function retryProposal(proposalId: string) {
    const id = activeId.current
    const session = currentSessions.current[id]
    if (!session || session.loading || session.loadError || session.sending || deletedIds.current.has(id)) {
      throw new Error('Wait for this chat to finish loading or replying, then try again.')
    }
    const result = await resolveNoteProposal(id, proposalId, 'reopen')
    updateSession(id, (current) => ({ ...current, mode: 'organize', messages: current.messages.map((message) => message.id === proposalId ? { ...result.message, attachments: [] } : message) }))
  }

  async function renameChat(id: string, title: string) {
    setChatMutationError('')
    try {
      const saved = await renameConversation(id, title)
      ++listVersion.current
      setConversations((current) => current.map((item) => item.id === id ? saved : item))
    } catch (error) {
      setChatMutationError(error instanceof Error ? error.message : 'Could not rename chat. Please retry.')
    }
  }

  async function deleteChat(id: string) {
    setChatMutationError('')
    try {
      await deleteConversation(id)
      deletedIds.current.add(id)
      ++listVersion.current
      setConversations((current) => current.filter((item) => item.id !== id))
      const remaining = { ...currentSessions.current }
      delete remaining[id]
      currentSessions.current = remaining
      setSessions(remaining)
      if (activeId.current === id) activate(crypto.randomUUID())
    } catch (error) {
      setChatMutationError(error instanceof Error ? error.message : 'Could not delete chat. Please retry.')
    }
  }

  const session = sessions[activeConversationId] ?? emptySession()
  return {
    ...session, activeConversationId, conversations, conversationsLoading, conversationsError, sendMessage, renameChat, deleteChat, chatMutationError, retryProposal,
    newChat: () => activate(crypto.randomUUID()),
    setMode: (mode: ChatMode) => updateSession(activeId.current, (current) => ({ ...current, mode })),
    resolveProposal: async (messageId: string, action: 'save' | 'discard' | 'undo' | 'reopen', title?: string, content?: string, document?: import('@/types/note').Note['content']) => {
      const id = activeId.current
      const result = await resolveNoteProposal(id, messageId, action, title, content, document)
      updateSession(id, (current) => ({ ...current, messages: current.messages.map((message) => message.id === messageId ? { ...result.message, attachments: [] } : message) }))
      return result.note
    },
    selectConversation: (id: string) => { activate(id); void loadConversation(id) },
    setDraft: (draft: string) => updateSession(activeId.current, (current) => ({ ...current, draft })),
    addAttachments: (files: File[]) => updateSession(activeId.current, (current) => ({
      ...current, attachments: [...current.attachments, ...files.map((file) => ({ id: crypto.randomUUID(), file }))],
    })),
    removeAttachment: (id: string) => updateSession(activeId.current, (current) => ({ ...current, attachments: current.attachments.filter((item) => item.id !== id) })),
    retry: () => {
      const id = activeId.current
      const pending = currentSessions.current[id]?.pending
      if (pending) void getReply(id, pending)
    },
    retryLoad: () => { void loadConversation(activeId.current, true) },
    retryConversations: () => { setConversationsLoading(true); setConversationsError(''); setListAttempt((attempt) => attempt + 1) },
  }
}
