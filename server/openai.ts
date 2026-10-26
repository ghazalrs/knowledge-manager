import type { ChatTextMessage } from '../src/types/chat.ts'
import { isObject, RequestError } from './api.ts'

type OpenAIOptions = {
  apiKey?: string
  model: string
  fetcher?: typeof fetch
}

export async function generateReply(messages: ChatTextMessage[], options: OpenAIOptions) {
  if (!options.apiKey?.trim()) {
    throw new RequestError(503, 'Add OPENAI_API_KEY to .env.local and restart the local server to connect OpenAI.')
  }
  let response: Response
  try {
    response = await (options.fetcher ?? fetch)('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model,
        store: false,
        instructions: 'You are a helpful assistant in Knowledge Manager. Answer clearly. You only have the text in this conversation; do not claim to read saved notes or attached files.',
        input: messages,
        max_output_tokens: 4096,
      }),
      signal: AbortSignal.timeout(90000),
    })
  } catch {
    throw new RequestError(502, 'Could not reach OpenAI or the request timed out. Please retry.')
  }
  if (!response.ok) {
    const message = response.status === 401 ? 'OpenAI rejected the API key. Check OPENAI_API_KEY and restart the server.'
      : response.status === 403 || response.status === 404 ? 'OpenAI could not access the selected model. Check OPENAI_MODEL and your account access.'
      : response.status === 429 ? 'OpenAI rate limit or billing limit reached. Check your API account and retry later.'
      : response.status >= 500 ? 'OpenAI is temporarily unavailable. Please retry.'
      : 'OpenAI could not process this conversation. Try a shorter message or a different model.'
    // Do not return raw upstream errors, headers, or credentials to the browser.
    throw new RequestError(response.status === 429 ? 429 : 502, message)
  }
  let data: unknown
  try { data = await response.json() }
  catch { throw new RequestError(502, 'OpenAI returned an unreadable reply. Please retry.') }
  if (!isObject(data) || !Array.isArray(data.output)) throw new RequestError(502, 'OpenAI returned no usable reply. Please retry.')
  if (data.status === 'incomplete') throw new RequestError(502, 'The reply reached its limit before completing. Try a shorter request or a different model.')
  const parts: string[] = []
  for (const item of data.output) {
    if (!isObject(item) || item.type !== 'message' || !Array.isArray(item.content)) continue
    for (const part of item.content) {
      if (!isObject(part)) continue
      if (part.type === 'output_text' && typeof part.text === 'string') parts.push(part.text)
      if (part.type === 'refusal' && typeof part.refusal === 'string') parts.push(part.refusal)
    }
  }
  const content = parts.join('\n').trim()
  if (!content) throw new RequestError(502, 'OpenAI returned an empty reply. Please retry.')
  return { content, model: options.model }
}
