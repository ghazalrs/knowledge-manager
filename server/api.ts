import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Note, NoteChanges } from '../src/types/note.ts'
import type { NotesStore } from './notes-store.ts'

class RequestError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function isLocalRequest(request: IncomingMessage) {
  const host = request.headers.host
  if (!host || !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  return !request.headers.origin || request.headers.origin === `http://${host}`
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validContent(value: unknown): value is Note['content'] {
  return isObject(value) && value.type === 'doc' && Array.isArray(value.content)
}

function validTitle(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (request.headers['content-type']?.split(';')[0] !== 'application/json') {
    throw new RequestError(415, 'Expected JSON')
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > 5 * 1024 * 1024) throw new RequestError(413, 'Note exceeds the 5 MB limit')
    chunks.push(Buffer.from(chunk))
  }
  let body: unknown
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch { throw new RequestError(400, 'Invalid JSON') }
  if (!isObject(body)) throw new RequestError(400, 'Expected an object')
  return body
}

function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(value))
}

export function createNotesApi(store: NotesStore) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    if (!isLocalRequest(request)) {
      json(response, 403, { error: 'Only requests from this local app are allowed' })
      return
    }
    try {
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
      const folderRoute = /^\/api\/folders\/([a-zA-Z0-9_-]{1,128})$/.exec(pathname)
      if (pathname === '/api/folders' && request.method === 'GET') {
        json(response, 200, store.loadFolders())
        return
      }
      if (pathname === '/api/folders' && request.method === 'POST') {
        const body = await readBody(request)
        if (typeof body.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(body.id)
          || !validTitle(body.name) || !Number.isSafeInteger(body.createdAt) || (body.createdAt as number) < 0) {
          throw new RequestError(400, 'Invalid folder')
        }
        store.createFolder({ id: body.id, name: body.name.trim(), createdAt: body.createdAt as number })
        response.writeHead(204).end()
        return
      }
      if (folderRoute && request.method === 'PATCH') {
        const body = await readBody(request)
        if (Object.keys(body).length !== 1 || !validTitle(body.name)) throw new RequestError(400, 'Invalid folder name')
        if (!store.renameFolder(folderRoute[1], body.name.trim())) throw new RequestError(404, 'Folder no longer exists')
        response.writeHead(204).end()
        return
      }
      if (folderRoute && request.method === 'DELETE') {
        store.deleteFolder(folderRoute[1])
        response.writeHead(204).end()
        return
      }
      const noteRoute = /^\/api\/notes\/([a-zA-Z0-9_-]{1,128})$/.exec(pathname)
      if (pathname === '/api/notes' && request.method === 'GET') {
        json(response, 200, store.loadNotes())
        return
      }
      if (pathname === '/api/notes' && request.method === 'POST') {
        const body = await readBody(request)
        if (typeof body.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(body.id)
          || !validTitle(body.title) || !validContent(body.content)
          || (body.folderId !== undefined && body.folderId !== null
            && (typeof body.folderId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(body.folderId)))
          || !Number.isSafeInteger(body.createdAt) || (body.createdAt as number) < 0) {
          throw new RequestError(400, 'Invalid note')
        }
        const created = store.createNote({
          id: body.id, title: body.title, content: body.content,
          createdAt: body.createdAt as number, folderId: (body.folderId as string | null | undefined) ?? null,
        })
        if (!created) throw new RequestError(404, 'Folder no longer exists. Refresh to load the latest folders.')
        response.writeHead(204).end()
        return
      }
      if (noteRoute && request.method === 'PATCH') {
        const body = await readBody(request)
        if (!Object.keys(body).length || Object.keys(body).some((key) => key !== 'title' && key !== 'content' && key !== 'folderId')
          || ('title' in body && !validTitle(body.title))
          || ('folderId' in body && body.folderId !== null
            && (typeof body.folderId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(body.folderId)))
          || ('content' in body && !validContent(body.content))) {
          throw new RequestError(400, 'Invalid note changes')
        }
        if (typeof body.folderId === 'string' && !store.hasFolder(body.folderId)) {
          throw new RequestError(404, 'Destination folder no longer exists')
        }
        if (!store.updateNote(noteRoute[1], body as NoteChanges)) throw new RequestError(404, 'Note no longer exists. Refresh to load the latest notes.')
        response.writeHead(204).end()
        return
      }
      if (noteRoute && request.method === 'DELETE') {
        store.deleteNote(noteRoute[1])
        response.writeHead(204).end()
        return
      }
      json(response, 404, { error: 'Unknown API route' })
    } catch (error) {
      if (error instanceof RequestError) json(response, error.status, { error: error.message })
      else {
        console.error('Note storage request failed:', error)
        json(response, 500, { error: 'Could not access the local database' })
      }
    }
  }
}
