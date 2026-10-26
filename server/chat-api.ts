import type { IncomingMessage, ServerResponse } from 'node:http'
import { isLocalRequest, isObject, json, readBody, RequestError } from './api.ts'
import { generateReply } from './openai.ts'
import type { ChatTextMessage } from '../src/types/chat.ts'

export function createChatApi(options: { apiKey?: string; model: string; fetcher?: typeof fetch }) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    if (!isLocalRequest(request)) { json(response, 403, { error: 'Local app requests only' }); return }
    if (request.method !== 'POST') { json(response, 405, { error: 'Use POST for chat' }); return }
    try {
      const body = await readBody(request)
      if (Object.keys(body).some((key) => key !== 'messages') || !Array.isArray(body.messages)
        || body.messages.length === 0 || body.messages.length > 200) {
        throw new RequestError(400, 'Send between 1 and 200 text messages.')
      }
      let totalLength = 0
      const messages: ChatTextMessage[] = body.messages.map((message) => {
        if (!isObject(message) || (message.role !== 'user' && message.role !== 'assistant')
          || typeof message.content !== 'string' || !message.content.trim()
          || Object.keys(message).some((key) => key !== 'role' && key !== 'content')) {
          throw new RequestError(400, 'Only user and assistant text messages are supported.')
        }
        totalLength += message.content.length
        return { role: message.role, content: message.content }
      })
      if (totalLength > 100000) throw new RequestError(413, 'This conversation is too long. Refresh to start a new chat.')
      if (messages[0].role !== 'user' || messages[messages.length - 1].role !== 'user') {
        throw new RequestError(400, 'A conversation must start and end with a user message.')
      }
      json(response, 200, await generateReply(messages, options))
    } catch (error) {
      if (error instanceof RequestError) json(response, error.status, { error: error.message })
      else json(response, 500, { error: 'Could not complete the chat request. Please retry.' })
    }
  }
}
