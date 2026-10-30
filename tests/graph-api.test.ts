import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { NotesStore } from '../server/notes-store.ts'
import { GraphStore } from '../server/graph-store.ts'
import { createGraphApi } from '../server/graph-api.ts'
import { createGraphExtractor } from '../server/graph-extraction.ts'
import { textDocument } from '../src/lib/note-text.ts'
import type { KnowledgeGraph } from '../src/types/graph.ts'

test('local graph API validates requests, refreshes saved notes, and preserves source content', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'graph-api-'))
  const path = join(directory, 'test.sqlite')
  const notes = new NotesStore(path)
  notes.createNote({ id: 'note', title: 'Study', content: textDocument('Sleep helps memory.'), folderId: null, createdAt: 1 })
  const originals = notes.loadNotes()
  let calls = 0
  const graph = new GraphStore(path, () => notes.loadNotes(), async () => {
    calls++
    return { concepts: [{ label: 'Sleep', evidence: 'Sleep' }, { label: 'Memory', evidence: 'memory' }], relationships: [{ source: 'Sleep', target: 'Memory', label: 'helps', evidence: 'Sleep helps memory.' }] }
  }, 'test')
  const server = createServer(createGraphApi(graph))
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Missing address')
    const url = `http://127.0.0.1:${address.port}/api/graph`
    const refresh = (body: unknown, origin?: string) => fetch(`${url}/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) })
    assert.equal((await (await fetch(url)).json() as KnowledgeGraph).progress.pending, 1)
    assert.equal(calls, 0)
    assert.equal((await refresh({}, 'https://unrelated.example')).status, 403)
    assert.equal((await refresh({ notes: ['untrusted content'] })).status, 400)
    assert.equal((await fetch(`${url}/refresh`)).status, 404)
    assert.equal(calls, 0)
    const result = await refresh({})
    assert.equal(result.status, 200)
    const snapshot = await result.json() as KnowledgeGraph
    assert.equal(snapshot.progress.pending, 0)
    assert.equal(snapshot.nodes.length, 3)
    assert.equal(snapshot.edges.length, 3)
    assert.equal((await refresh({})).status, 200)
    assert.equal(calls, 1)
    assert.deepEqual(notes.loadNotes(), originals)
    notes.createNote({ id: 'other', title: 'Other', content: textDocument('Other subject.'), folderId: null, createdAt: 1 })
    const decide = (body: unknown, origin?: string) => fetch(`${url}/connections`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) })
    const choice = { source: 'note:note', target: 'note:other', action: 'keep' }
    assert.equal((await decide(choice, 'https://unrelated.example')).status, 403)
    assert.equal((await decide({ ...choice, action: 'invalid' })).status, 400)
    assert.equal((await decide({ ...choice, target: 'note:missing' })).status, 400)
    assert.equal((await decide({ ...choice, target: 'note:note' })).status, 400)
    assert.equal((await decide({ ...choice, unexpected: true })).status, 400)
    assert.equal((await decide(choice)).status, 200)
    assert.equal((await (await fetch(url)).json() as KnowledgeGraph).decisions?.[0].action, 'keep')
    assert.equal((await decide({ ...choice, action: 'dismiss' })).status, 200)
    assert.equal((await decide({ ...choice, action: 'reset' })).status, 200)
    assert.equal((await (await fetch(url)).json() as KnowledgeGraph).decisions, undefined)
    notes.deleteNote('other')
    notes.deleteNote('note')
    assert.equal((await (await fetch(url)).json() as KnowledgeGraph).edges.length, 0)
  } finally {
    await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections() })
    graph.close(); notes.close(); await rm(directory, { recursive: true })
  }
})

test('cached graph reads need no API key and extraction failures remain retryable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'graph-api-error-'))
  const path = join(directory, 'test.sqlite')
  const notes = new NotesStore(path)
  notes.createNote({ id: 'note', title: 'Study', content: textDocument('Study a topic.'), folderId: null, createdAt: 1 })
  const graph = new GraphStore(path, () => notes.loadNotes(), createGraphExtractor({ model: 'test' }), 'test')
  const server = createServer(createGraphApi(graph))
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Missing address')
    const url = `http://127.0.0.1:${address.port}/api/graph`
    assert.equal((await fetch(url)).status, 200)
    const response = await fetch(`${url}/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    assert.equal(response.status, 503)
    assert.match((await response.json() as { error: string }).error, /OPENAI_API_KEY/)
    assert.equal(graph.snapshot().progress.pending, 1)
    assert.equal(notes.loadNotes()[0].title, 'Study')
  } finally {
    await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections() })
    graph.close(); notes.close(); await rm(directory, { recursive: true })
  }
})
