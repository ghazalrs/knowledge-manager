import type { ChatTextMessage } from '@/types/chat'

export async function requestChatReply(messages: ChatTextMessage[]): Promise<{ content: string; model: string }> {
  let response: Response
  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
      signal: AbortSignal.timeout(100000),
    })
  } catch {
    throw new Error('Could not reach the local server or the request timed out. Please retry.')
  }
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Could not get a reply. Please retry.')
  if (typeof data?.content !== 'string' || !data.content.trim()) throw new Error('The server returned an empty reply. Please retry.')
  return data
}
