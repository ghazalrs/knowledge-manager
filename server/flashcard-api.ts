import type { IncomingMessage, ServerResponse } from 'node:http'
import { isLocalRequest, json, readBody, RequestError } from './api.ts'
import type { FlashcardStore } from './flashcard-store.ts'
import type { createFlashcardGenerator } from './flashcard-generation.ts'

export function createFlashcardApi(store: FlashcardStore, generate: ReturnType<typeof createFlashcardGenerator>) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    if (!isLocalRequest(request)) { json(response, 403, { error: 'Only requests from this local app are allowed' }); return }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 70000)
    const cancel = () => { if (!response.writableEnded) controller.abort() }
    response.once('close', cancel)
    try {
      const path = request.url?.split('?')[0]
      const card = /^\/api\/flashcards\/([a-zA-Z0-9_-]{1,128})$/.exec(path ?? '')
      if (path === '/api/flashcards' && request.method === 'GET') { json(response, 200, store.list()); return }
      if (card && request.method === 'DELETE') { store.delete(card[1]); response.writeHead(204).end(); return }
      if (card && request.method === 'PATCH') {
        const body = await readBody(request)
        if (Object.keys(body).length !== 1 || (body.rating !== 'again' && body.rating !== 'got-it')) throw new RequestError(400, 'Choose Again or Got it.')
        store.review(card[1], body.rating)
        response.writeHead(204).end(); return
      }
      if ((path === '/api/flashcards/generate' || path === '/api/flashcards') && request.method === 'POST') {
        const body = await readBody(request)
        if (typeof body.noteId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(body.noteId)) throw new RequestError(400, 'Choose a saved note.')
        if (path.endsWith('/generate')) {
          if (Object.keys(body).length !== 1) throw new RequestError(400, 'Generation accepts a saved note ID only.')
          json(response, 200, await store.generate(body.noteId, generate, controller.signal)); return
        }
        if (Object.keys(body).length !== 3 || typeof body.sourceFingerprint !== 'string') throw new RequestError(400, 'Invalid flashcard preview.')
        json(response, 200, store.save(body.noteId, body.sourceFingerprint, body.cards)); return
      }
      json(response, 404, { error: 'Unknown flashcard route' })
    } catch (error) {
      if (controller.signal.aborted) json(response, 504, { error: 'Flashcard generation timed out. Please retry.' })
      else if (error instanceof RequestError) json(response, error.status, { error: error.message })
      else json(response, 500, { error: 'Could not access flashcards. Please retry.' })
    } finally { clearTimeout(timer); response.off('close', cancel) }
  }
}
