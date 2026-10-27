import type { IncomingMessage, ServerResponse } from 'node:http'
import { isLocalRequest, json, readBody, RequestError } from './api.ts'
import { generateReply, generateConversationTitle, generateNoteProposal } from './openai.ts'
import type { ChatStore } from './chat-store.ts'
import type { StoredChatMessage } from '../src/types/chat.ts'

export function createChatApi(options: { apiKey?: string; model: string; fetcher?: typeof fetch; titleGenerator?: typeof generateConversationTitle }, store: ChatStore) {
  const inFlight = new Map<string, { id: string; work: Promise<StoredChatMessage> }>()
  const titleJobs = new Set<string>()

  function updateTitle(conversationId: string) {
    if (titleJobs.has(conversationId)) return
    const messages = store.loadMessages(conversationId)
    const last = messages.at(-1)
    if (last?.role !== 'assistant' || !store.claimTitle(conversationId, last.id)) return
    titleJobs.add(conversationId)
    // Bound the context while retaining the opening topic and recent requests.
    const selected = messages.length > 12 ? [...messages.slice(0, 2), ...messages.slice(-10)] : messages
    const context = selected.map(({ role, content }) => ({ role, content: content.slice(0, 4000) }))
    void (options.titleGenerator ?? generateConversationTitle)(context, options)
      .then((title) => store.finishTitle(conversationId, title))
      .catch(() => store.finishTitle(conversationId))
      .finally(() => {
        titleJobs.delete(conversationId)
        // A further exchange may have completed while this title was pending.
        if (store.loadMessages(conversationId).at(-1)?.id !== last.id) updateTitle(conversationId)
      })
  }

  return async (request: IncomingMessage, response: ServerResponse) => {
    if (!isLocalRequest(request)) { json(response, 403, { error: 'Local app requests only' }); return }
    try {
      const url = new URL(request.url ?? '/', 'http://localhost')
      const path = url.pathname
      const proposalRoute = /^\/api\/chat\/conversations\/([a-zA-Z0-9_-]{1,128})\/proposals\/([a-zA-Z0-9_-]{1,128})$/.exec(path)
      if (proposalRoute && request.method === 'POST') {
        const body = await readBody(request)
        if (body.action !== 'save' && body.action !== 'discard') throw new RequestError(400, 'Choose Save or Discard.')
        if (Object.keys(body).some((key) => !['action', 'title', 'content'].includes(key))
          || (body.action === 'save' && (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 200
            || typeof body.content !== 'string' || !body.content.trim() || body.content.length > 50000))) {
          throw new RequestError(400, 'Provide a title (up to 200 characters) and note text (up to 50,000 characters).')
        }
        json(response, 200, store.resolveProposal(proposalRoute[1], proposalRoute[2], body.action,
          typeof body.title === 'string' ? body.title.trim() : undefined, typeof body.content === 'string' ? body.content.trim() : undefined))
        return
      }
      const conversationRoute = /^\/api\/chat\/conversations\/([a-zA-Z0-9_-]{1,128})$/.exec(path)
      if (conversationRoute && (request.method === 'PATCH' || request.method === 'DELETE')) {
        const id = conversationRoute[1]
        if (!store.hasConversation(id)) throw new RequestError(404, 'Conversation not found.')
        if (request.method === 'DELETE') {
          store.deleteConversation(id)
          json(response, 200, { deleted: true })
        } else {
          const body = await readBody(request)
          if (Object.keys(body).length !== 1 || typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 80) {
            throw new RequestError(400, 'Use a chat title between 1 and 80 characters.')
          }
          json(response, 200, store.renameConversation(id, body.title.trim()))
        }
        return
      }
      if (path === '/api/chat/conversations' && request.method === 'GET') {
        json(response, 200, store.listConversations())
        return
      }
      if (path === '/api/chat/conversations' && request.method === 'POST') {
        const body = await readBody(request)
        if (Object.keys(body).length !== 1 || typeof body.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(body.id) || body.id === 'main') {
          throw new RequestError(400, 'Send a valid new conversation ID.')
        }
        json(response, 200, store.createConversation(body.id))
        return
      }
      if (path === '/api/chat/history' && request.method === 'GET') {
        const conversationId = url.searchParams.get('conversationId') ?? 'main'
        if (!store.hasConversation(conversationId)) throw new RequestError(404, 'Conversation not found.')
        updateTitle(conversationId)
        json(response, 200, store.loadMessages(conversationId))
        return
      }
      if (path !== '/api/chat') { json(response, 404, { error: 'Unknown chat route' }); return }
      if (request.method !== 'POST') { json(response, 405, { error: 'Use POST for chat' }); return }
      const body = await readBody(request)
      if (Object.keys(body).some((key) => key !== 'id' && key !== 'content' && key !== 'conversationId' && key !== 'mode')
        || (body.mode !== undefined && body.mode !== 'ask' && body.mode !== 'organize')
        || (body.conversationId !== undefined && (typeof body.conversationId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(body.conversationId)))
        || typeof body.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(body.id)
        || typeof body.content !== 'string' || !body.content.trim()) {
        throw new RequestError(400, 'Send a message ID and non-empty text.')
      }
      if (body.content.length > 50000) throw new RequestError(413, 'This message is too long. Please shorten it.')
      const id = body.id
      const content = body.content.trim()
      const mode = body.mode === 'organize' ? 'organize' : 'ask'
      const conversationId = typeof body.conversationId === 'string' ? body.conversationId : 'main'
      if (!store.hasConversation(conversationId)) throw new RequestError(404, 'Conversation not found.')
      const savedReply = store.findReply(id, conversationId)
      if (savedReply) {
        if (!store.saveUserMessage(id, content, conversationId, mode)) throw new RequestError(409, 'This message ID is already in use.')
        json(response, 200, savedReply)
        return
      }
      const running = inFlight.get(conversationId)
      if (running && running.id !== id) throw new RequestError(409, 'Another reply is being generated in this chat. Please retry after it finishes.')
      if (!store.saveUserMessage(id, content, conversationId, mode)) throw new RequestError(409, 'This message ID is already in use.')
      let work = running?.work
      if (!work) {
        work = (async () => {
          // All text stays saved locally. Send only a bounded recent context to OpenAI.
          const context = store.contextThrough(id, conversationId).slice(-200)
          let length = context.reduce((sum, message) => sum + message.content.length, 0)
          while (context.length > 1 && (length > 100000 || context[0].role !== 'user')) {
            length -= context.shift()!.content.length
          }
          const input = context.map(({ role, content: text }) => ({ role, content: text }))
          const proposal = mode === 'organize' ? await generateNoteProposal(input, options) : undefined
          const reply = proposal ? { content: 'Review this proposed note. Edit it, then choose Save note to add it to your workspace.' } : await generateReply(input, options)
          if (!store.hasConversation(conversationId)) throw new RequestError(404, 'Conversation was deleted.')
          const saved = store.saveReply(id, reply.content, conversationId, proposal)
          updateTitle(conversationId)
          return saved
        })()
        inFlight.set(conversationId, { id, work })
      }
      try { json(response, 200, await work) }
      finally { if (inFlight.get(conversationId)?.work === work) inFlight.delete(conversationId) }
    } catch (error) {
      if (error instanceof RequestError) json(response, error.status, { error: error.message })
      else json(response, 500, { error: 'Could not save or complete this chat message. Keep the page open and retry.' })
    }
  }
}
