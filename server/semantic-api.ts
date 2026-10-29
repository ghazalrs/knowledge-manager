import type { IncomingMessage, ServerResponse } from 'node:http'
import { isLocalRequest, json, readBody, RequestError } from './api.ts'
import type { SemanticSearch } from './semantic-search.ts'

export function createSemanticApi(search: SemanticSearch) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    if (!isLocalRequest(request)) { json(response, 403, { error: 'Only requests from this local app are allowed' }); return }
    if (request.method !== 'POST' || request.url?.split('?')[0] !== '/api/search/semantic') {
      json(response, 404, { error: 'Unknown search route' }); return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 90000)
    const abort = () => { if (!response.writableEnded) controller.abort() }
    response.once('close', abort)
    try {
      const body = await readBody(request)
      if (typeof body.query !== 'string' || !body.query.trim() || Buffer.byteLength(body.query) > 2000
        || (body.folderId !== undefined && body.folderId !== null && (typeof body.folderId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(body.folderId)))) {
        throw new RequestError(400, 'Enter a search of at most 2,000 bytes and a valid folder.')
      }
      json(response, 200, await search.search(body.query.trim(), (body.folderId as string | null | undefined) ?? null, controller.signal))
    } catch (error) {
      if (controller.signal.aborted) json(response, 504, { error: 'Semantic search took too long. Retry to continue building the index; completed notes are cached.' })
      else if (error instanceof RequestError) json(response, error.status, { error: error.message })
      else json(response, 500, { error: 'Could not search the local index. Retry semantic search.' })
    } finally {
      clearTimeout(timer)
      response.off('close', abort)
    }
  }
}
