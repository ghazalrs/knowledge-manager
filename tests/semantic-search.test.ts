import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { NotesStore } from '../server/notes-store.ts'
import { SemanticSearch, passages, similarity } from '../server/semantic-search.ts'
import { createEmbedder } from '../server/embeddings.ts'
import { createSemanticApi } from '../server/semantic-api.ts'
import { textDocument } from '../src/lib/note-text.ts'

test('semantic ranking, persistent caching, edits, folder moves and deletion use current notes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'semantic-'))
  const path = join(directory, 'test.sqlite')
  const store = new NotesStore(path)
  const calls: string[][] = []
  const embed = async (inputs: string[]) => {
    calls.push(inputs)
    return inputs.map((input) => /sleep|rest|tired/i.test(input) ? [1, 0] : [0, 1])
  }
  let search = new SemanticSearch(path, () => store.loadNotes(), embed)
  const signal = new AbortController().signal
  try {
    store.createFolder({ id: 'folder', name: 'Health', createdAt: 1 })
    store.createNote({ id: 'rest', title: 'Rest', content: textDocument('Sleep helps recovery.'), createdAt: 1, folderId: 'folder' })
    store.createNote({ id: 'food', title: 'Cooking', content: textDocument('Roast vegetables.'), createdAt: 2, folderId: null })
    const first = await search.search('Why am I tired?', null, signal)
    assert.deepEqual(first.results.map((result) => result.noteId), ['rest'])
    assert.equal(first.refreshed, 2)
    assert.match(first.results[0].excerpt, /Sleep/)
    search.close()
    search = new SemanticSearch(path, () => store.loadNotes(), embed)
    calls.length = 0
    assert.equal((await search.search('tired', null, signal)).refreshed, 0)
    assert.deepEqual(calls, [['tired']])
    store.updateNote('rest', { content: textDocument('Roast vegetables instead.') , title: 'Recipe' })
    assert.equal((await search.search('tired', null, signal)).results.length, 0)
    assert.equal(calls.length, 3)
    store.updateNote('food', { folderId: 'folder' })
    assert.equal((await search.search('vegetables', 'folder', signal)).results.length, 2)
    store.deleteFolder('folder')
    assert.equal((await search.search('tired', null, signal)).results.length, 0)
    const db = new DatabaseSync(path)
    assert.equal(db.prepare('SELECT count(*) AS count FROM note_embeddings').get()?.count, 0)
    db.close()
  } finally { search.close(); store.close(); await rm(directory, { recursive: true }) }
})

test('Unicode passages preserve all text and remain bounded; cosine compares direction', () => {
  const text = '🧠日本語'.repeat(1500)
  const chunks = passages(text)
  assert.ok(chunks.length > 1)
  assert.ok(chunks.every((chunk) => Buffer.byteLength(chunk) <= 2000 && !chunk.includes('\uFFFD')))
  assert.equal(chunks[0] + chunks.slice(1).map((chunk) => Array.from(chunk).slice(50).join('')).join(''), text)
  assert.equal(similarity([1, 0], [8, 0]), 1)
  assert.equal(similarity([1, 0], [0, 1]), 0)
  assert.throws(() => similarity([1], [1, 0]), /dimensions/)
})

test('a later passage can match and failed indexing resumes using completed notes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'semantic-resume-'))
  const path = join(directory, 'test.sqlite')
  const store = new NotesStore(path)
  store.createNote({ id: 'long', title: 'Long note', content: textDocument(`${'vegetables '.repeat(500)}sleep`), createdAt: 2, folderId: null })
  store.createNote({ id: 'next', title: 'Fail once', content: textDocument('vegetables'), createdAt: 1, folderId: null })
  let fail = true
  const calls: string[][] = []
  const search = new SemanticSearch(path, () => store.loadNotes(), async (inputs) => {
    calls.push(inputs)
    if (fail && inputs[0].startsWith('Fail once')) throw new Error('temporary failure')
    return inputs.map((text) => /sleep|tired/.test(text) ? [1, 0] : [0, 1])
  })
  try {
    await assert.rejects(search.search('tired', null, new AbortController().signal), /temporary failure/)
    calls.length = 0
    fail = false
    const result = await search.search('tired', null, new AbortController().signal)
    assert.deepEqual(result.results.map((match) => match.noteId), ['long'])
    assert.match(result.results[0].excerpt, /vegetables/)
    assert.equal(result.refreshed, 1)
    assert.equal(calls.length, 2)
    assert.ok(calls.every((batch) => !batch.some((input) => input.startsWith('Long note'))))
  } finally { search.close(); store.close(); await rm(directory, { recursive: true }) }
})

test('edits during query generation exclude stale matches, failures release the search lock', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'semantic-race-'))
  const path = join(directory, 'test.sqlite')
  const store = new NotesStore(path)
  store.createNote({ id: 'note', title: 'Original', content: textDocument('old'), createdAt: 1, folderId: null })
  let fail = false
  const search = new SemanticSearch(path, () => store.loadNotes(), async (inputs) => {
    if (fail) throw new Error('offline')
    if (inputs[0] === 'query') {
      await assert.rejects(search.search('concurrent', null, new AbortController().signal), /Another/)
      store.updateNote('note', { title: 'Changed' })
    }
    return inputs.map(() => [1, 0])
  })
  try {
    assert.deepEqual((await search.search('query', null, new AbortController().signal)).results, [])
    fail = true
    await assert.rejects(search.search('again', null, new AbortController().signal), /offline/)
    fail = false
    assert.equal((await search.search('again', null, new AbortController().signal)).results.length, 1)
  } finally { search.close(); store.close(); await rm(directory, { recursive: true }) }
})

test('embedding provider validates response ordering and vectors and keeps provider errors private', async () => {
  const signal = new AbortController().signal
  await assert.rejects(createEmbedder(undefined)(['hello'], signal), /OPENAI_API_KEY/)
  let sent: Record<string, unknown> = {}
  const embed = createEmbedder('test-key', async (_url, init) => {
    sent = JSON.parse(init?.body as string)
    return Response.json({ data: [{ index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }] })
  })
  assert.deepEqual(await embed(['first', 'second'], signal), [[1, 0], [0, 1]])
  assert.equal(sent.model, 'text-embedding-3-small')
  for (const data of [[], [{ index: 0, embedding: [0, 0] }], [{ index: 2, embedding: [1, 0] }], [{ index: 0, embedding: ['bad'] }]]) {
    await assert.rejects(createEmbedder('key', async () => Response.json({ data }))(['one'], signal), /response/)
  }
  await assert.rejects(createEmbedder('key', async () => new Response('secret provider message', { status: 429 }))(['one'], signal), /usage limit/)
})

test('semantic endpoint rejects invalid and cross-origin requests before contacting the provider', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'semantic-api-'))
  const path = join(directory, 'test.sqlite')
  const store = new NotesStore(path)
  store.createNote({ id: 'note', title: 'Test', content: textDocument('body'), createdAt: 1, folderId: null })
  let calls = 0
  const search = new SemanticSearch(path, () => store.loadNotes(), async (inputs) => { calls++; return inputs.map(() => [1, 0]) })
  const server = createServer(createSemanticApi(search))
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Missing address')
    const url = `http://127.0.0.1:${address.port}/api/search/semantic`
    const post = (body: unknown, origin?: string) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) })
    assert.equal((await post({ query: 'test' }, 'https://example.com')).status, 403)
    for (const body of [{ query: '' }, { query: 'x'.repeat(2001) }, { query: 'ok', folderId: 1 }]) assert.equal((await post(body)).status, 400)
    assert.equal(calls, 0)
    assert.equal((await fetch(url)).status, 404)
    const response = await post({ query: 'test' })
    assert.equal(response.status, 200)
    assert.equal((await response.json() as { results: unknown[] }).results.length, 1)
    assert.equal(calls, 2)
  } finally {
    await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections() })
    search.close(); store.close(); await rm(directory, { recursive: true })
  }
})
