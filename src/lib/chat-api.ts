import type { Conversation, StoredChatMessage } from '@/types/chat'

async function chatRequest(path: string, message?: unknown, method = message ? 'POST' : 'GET') {
  let response: Response
  try {
    response = await fetch(`/api/chat${path}`, {
      method,
      headers: message ? { 'Content-Type': 'application/json' } : undefined,
      body: message ? JSON.stringify(message) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(message ? 100000 : 10000),
    })
  } catch {
    throw new Error('Could not reach the local server or the request timed out. Please retry.')
  }
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Could not access chat history. Please retry.')
  return data
}

export async function renameConversation(id: string, title: string): Promise<Conversation> {
  return chatRequest(`/conversations/${encodeURIComponent(id)}`, { title }, 'PATCH')
}

export async function deleteConversation(id: string): Promise<void> {
  await chatRequest(`/conversations/${encodeURIComponent(id)}`, undefined, 'DELETE')
}

export async function loadChatHistory(conversationId: string): Promise<StoredChatMessage[]> {
  const data = await chatRequest(`/history?conversationId=${encodeURIComponent(conversationId)}`)
  if (!Array.isArray(data)) throw new Error('Could not read saved chat history. Please retry.')
  return data
}

export async function loadConversations(): Promise<Conversation[]> {
  const data = await chatRequest('/conversations')
  if (!Array.isArray(data)) throw new Error('Could not read saved conversations. Please retry.')
  return data
}

export async function createConversation(id: string): Promise<Conversation> {
  return chatRequest('/conversations', { id })
}

export async function requestChatReply(message: { id: string; content: string; conversationId: string }): Promise<StoredChatMessage> {
  const data = await chatRequest('', message)
  if (typeof data?.content !== 'string' || !data.content.trim() || data.role !== 'assistant' || typeof data.id !== 'string') {
    throw new Error('The server returned an unreadable reply. Please retry.')
  }
  return data
}
