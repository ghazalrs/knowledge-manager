import { RequestError, isObject } from './api.ts'

export const embeddingModel = 'text-embedding-3-small'
export type Embed = (inputs: string[], signal: AbortSignal) => Promise<number[][]>

export function validVector(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 4096
    && value.every((item) => typeof item === 'number' && Number.isFinite(item))
    && Number.isFinite(Math.hypot(...value)) && Math.hypot(...value) > 0
}

export function createEmbedder(apiKey: string | undefined, fetcher: typeof fetch = fetch): Embed {
  return async (input, signal) => {
    if (!apiKey) throw new RequestError(503, 'Set OPENAI_API_KEY in .env.local and restart the server to use semantic search.')
    let response: Response
    try {
      response = await fetcher('https://api.openai.com/v1/embeddings', {
        method: 'POST', signal,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: embeddingModel, input, encoding_format: 'float' }),
      })
    } catch {
      throw new RequestError(502, 'Could not reach the embeddings service. Retry semantic search.')
    }
    if (!response.ok) {
      const message = response.status === 429 ? 'Embedding rate or usage limit reached. Check your OpenAI account and retry later.'
        : response.status === 401 ? 'The OpenAI API key was rejected. Check .env.local and restart the server.'
        : 'The embeddings service could not complete the request. Retry semantic search.'
      throw new RequestError(502, message)
    }
    let body: unknown
    try { body = await response.json() } catch { throw new RequestError(502, 'Invalid embeddings response. Retry semantic search.') }
    if (!isObject(body) || !Array.isArray(body.data) || body.data.length !== input.length) {
      throw new RequestError(502, 'Incomplete embeddings response. Retry semantic search.')
    }
    const vectors: number[][] = []
    for (const item of body.data) {
      if (!isObject(item) || !Number.isInteger(item.index) || (item.index as number) < 0
        || (item.index as number) >= input.length || vectors[item.index as number] || !validVector(item.embedding)) {
        throw new RequestError(502, 'Invalid embeddings response. Retry semantic search.')
      }
      vectors[item.index as number] = item.embedding
    }
    if (vectors.some((vector) => vector.length !== vectors[0].length)) throw new RequestError(502, 'Inconsistent embedding dimensions.')
    return vectors
  }
}
