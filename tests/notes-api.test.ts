import assert from 'node:assert/strict'
import { createServer, get } from 'node:http'
import { test } from 'node:test'
import { createNotesApi } from '../server/api.ts'
import { NotesStore } from '../server/notes-store.ts'
import type { Note } from '../src/types/note.ts'

test('independent HTTP clients share notes; invalid and unrelated requests cannot change them', async () => {
  const store = new NotesStore(':memory:')
  const server = createServer(createNotesApi(store))
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No test server address')
    const base = `http://127.0.0.1:${address.port}`
    const note: Note = {
      id: 'shared', title: 'From browser A', createdAt: 1,
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    }
    const clientA = (path: string, method: string, body?: unknown, headers: Record<string, string> = {}) => fetch(`${base}${path}`, {
      method, body: body === undefined ? undefined : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', Origin: base, ...headers },
    })
    const clientB = async (): Promise<Note[]> => (await fetch(`${base}/api/notes`)).json() as Promise<Note[]>
    assert.equal((await clientA('/api/notes', 'POST', note)).status, 204)
    assert.deepEqual(await clientB(), [note])
    assert.equal((await clientA('/api/notes/shared', 'PATCH', { title: 'Renamed' })).status, 204)
    assert.equal((await clientB())[0].title, 'Renamed')
    assert.equal((await clientA('/api/notes', 'POST', { ...note, createdAt: 'bad' })).status, 400)
    assert.equal((await clientA('/api/notes/shared', 'PATCH', { createdAt: 9 })).status, 400)
    assert.equal((await clientA('/api/notes/shared', 'DELETE', undefined, { Origin: 'https://unrelated.example' })).status, 403)
    const unrelatedHostStatus = await new Promise<number | undefined>((resolve, reject) => {
      get(`${base}/api/notes`, { headers: { Host: 'unrelated.example' } }, (response) => {
        response.resume()
        resolve(response.statusCode)
      }).on('error', reject)
    })
    assert.equal(unrelatedHostStatus, 403)
    assert.equal((await clientB()).length, 1)
    const malformed = await fetch(`${base}/api/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })
    assert.equal(malformed.status, 400)
    assert.equal((await clientA('/api/notes/shared', 'DELETE')).status, 204)
    assert.equal((await clientA('/api/notes/shared', 'DELETE')).status, 204)
    assert.equal((await clientA('/api/notes/shared', 'PATCH', { title: 'Stale' })).status, 404)
    assert.deepEqual(await clientB(), [])
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
      server.closeAllConnections()
    })
    store.close()
  }
})
