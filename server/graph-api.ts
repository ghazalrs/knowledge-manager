import type { IncomingMessage, ServerResponse } from 'node:http'
import { isLocalRequest, json, readBody, RequestError } from './api.ts'
import type { GraphStore } from './graph-store.ts'

export function createGraphApi(store: GraphStore) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    if (!isLocalRequest(request)) { json(response, 403, { error: 'Only requests from this local app are allowed' }); return }
    const path = request.url?.split('?')[0]
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 60000)
    const cancel = () => { if (!response.writableEnded) controller.abort() }
    response.once('close', cancel)
    try {
      if (path === '/api/graph' && request.method === 'GET') { json(response, 200, store.snapshot()); return }
      if (path === '/api/graph/connections' && request.method === 'POST') {
        const body = await readBody(request)
        if (Object.keys(body).length !== 3 || typeof body.source !== 'string' || typeof body.target !== 'string'
          || !['keep', 'dismiss', 'reset'].includes(body.action as string)) throw new RequestError(400, 'Send source, target, and keep, dismiss, or reset action.')
        json(response, 200, store.decide(body.source, body.target, body.action as 'keep' | 'dismiss' | 'reset')); return
      }
      if (path !== '/api/graph/refresh' || request.method !== 'POST') { json(response, 404, { error: 'Unknown graph route' }); return }
      const body = await readBody(request)
      if (Object.keys(body).length) throw new RequestError(400, 'Graph extraction uses saved notes only; send an empty object.')
      json(response, 200, await store.refreshNext(controller.signal))
    } catch (error) {
      if (controller.signal.aborted) json(response, 504, { error: 'Graph extraction timed out. Retry to continue; completed work is saved.' })
      else if (error instanceof RequestError) json(response, error.status, { error: error.message })
      else json(response, 500, { error: 'Could not load or update the knowledge graph. Please retry.' })
    } finally {
      clearTimeout(timer)
      response.off('close', cancel)
    }
  }
}
