import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { NotesStore } from '../server/notes-store.ts'
import { GraphStore, graphChunks } from '../server/graph-store.ts'
import { createGraphExtractor, validateExtraction } from '../server/graph-extraction.ts'
import { textDocument } from '../src/lib/note-text.ts'
import type { NoteGraphExtraction } from '../src/types/graph.ts'
import { semanticText } from '../server/semantic-search.ts'

const text = 'Sleep supports memory. Memory helps learning.'
const extraction: NoteGraphExtraction = {
  concepts: [{ label: 'Sleep', evidence: 'Sleep supports memory.' }, { label: 'Memory', evidence: 'Memory helps learning.' }],
  relationships: [{ source: 'Sleep', target: 'Memory', label: 'supports', evidence: 'Sleep supports memory.' }],
}

test('graph cache survives restart, shares concepts between notes, and never changes source notes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'graph-cache-'))
  const path = join(directory, 'test.sqlite')
  const notes = new NotesStore(path)
  let calls = 0
  const extract = async () => { calls++; return structuredClone(extraction) }
  let graph = new GraphStore(path, () => notes.loadNotes(), extract, 'test')
  try {
    for (const id of ['first', 'second']) notes.createNote({ id, title: id, content: textDocument(text), folderId: null, createdAt: 1 })
    const originals = notes.loadNotes()
    assert.equal(graph.snapshot().progress.pending, 2)
    assert.equal(graph.snapshot().nodes.length, 2)
    await graph.refreshNext(new AbortController().signal)
    assert.equal(graph.snapshot().progress.pending, 1)
    await graph.refreshNext(new AbortController().signal)
    assert.deepEqual(notes.loadNotes(), originals)
    assert.deepEqual(notes.loadFolders(), [])
    const snapshot = graph.snapshot()
    assert.equal(snapshot.nodes.filter((node) => node.kind === 'concept').length, 2)
    assert.equal(snapshot.edges.filter((edge) => edge.kind === 'mentions').length, 4)
    assert.equal(snapshot.edges.filter((edge) => edge.kind === 'relationship').length, 1)
    assert.equal(snapshot.edges.find((edge) => edge.kind === 'relationship')?.evidence.length, 2)
    assert.ok(snapshot.edges.every((edge) => snapshot.nodes.some((node) => node.id === edge.source) && snapshot.nodes.some((node) => node.id === edge.target)))
    graph.close()
    graph = new GraphStore(path, () => notes.loadNotes(), extract, 'test')
    assert.deepEqual(graph.snapshot(), snapshot)
    await graph.refreshNext(new AbortController().signal)
    assert.equal(calls, 2)
    notes.updateNote('first', { title: 'New title' })
    assert.equal(graph.snapshot().progress.pending, 1)
    assert.ok(!graph.snapshot().edges.some((edge) => edge.evidence.some((item) => item.noteId === 'first')))
    await graph.refreshNext(new AbortController().signal)
    assert.equal(calls, 3)
    notes.deleteNote('first')
    assert.ok(!graph.snapshot().edges.some((edge) => edge.evidence.some((item) => item.noteId === 'first')))
    notes.deleteNote('second')
    assert.deepEqual(graph.snapshot(), { nodes: [], edges: [], progress: { completed: 0, total: 0, pending: 0 } })
    const db = new DatabaseSync(path)
    assert.equal(db.prepare('SELECT count(*) AS count FROM note_graph_chunks').get()?.count, 0)
    db.close()
  } finally { graph.close(); notes.close(); await rm(directory, { recursive: true }) }
})

test('chunked extraction resumes after failures and invalidates the cache when model or text changes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'graph-progress-'))
  const path = join(directory, 'test.sqlite')
  const notes = new NotesStore(path)
  const note = { id: 'long', title: 'Long', content: textDocument(text.repeat(500)), folderId: null, createdAt: 1 }
  notes.createNote(note)
  let fail = false
  let calls = 0
  let graph = new GraphStore(path, () => notes.loadNotes(), async () => {
    calls++
    if (fail) throw new Error('Offline')
    return { concepts: [], relationships: [] }
  }, 'first-model')
  try {
    assert.ok(graphChunks(note).length > 1)
    assert.ok(graphChunks(note).every((chunk) => Buffer.byteLength(chunk) <= 8010))
    assert.ok(graphChunks(note).every((chunk) => semanticText(note).includes(chunk)))
    const unicodeNote = { ...note, content: textDocument('🧠日本語 text. '.repeat(2000)) }
    assert.ok(graphChunks(unicodeNote).every((chunk) => semanticText(unicodeNote).includes(chunk) && !chunk.includes('\uFFFD')))
    await graph.refreshNext(new AbortController().signal)
    const completed = graph.snapshot().progress.completed
    fail = true
    await assert.rejects(graph.refreshNext(new AbortController().signal), /Offline/)
    assert.equal(graph.snapshot().progress.completed, completed)
    fail = false
    while (graph.snapshot().progress.pending) await graph.refreshNext(new AbortController().signal)
    assert.equal(calls, graphChunks(note).length + 1)
    graph.close()
    graph = new GraphStore(path, () => notes.loadNotes(), async () => ({ concepts: [], relationships: [] }), 'second-model')
    assert.equal(graph.snapshot().progress.completed, 0)
  } finally { graph.close(); notes.close(); await rm(directory, { recursive: true }) }
})

test('graph extraction refuses stale edits, concurrent refreshes, invalid evidence, and aborted writes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'graph-race-'))
  const path = join(directory, 'test.sqlite')
  const notes = new NotesStore(path)
  notes.createNote({ id: 'note', title: 'Original', content: textDocument(text), folderId: null, createdAt: 1 })
  let action = 'edit'
  const controller = new AbortController()
  const graph = new GraphStore(path, () => notes.loadNotes(), async () => {
    await assert.rejects(graph.refreshNext(new AbortController().signal), /already running/)
    if (action === 'edit') notes.updateNote('note', { title: 'Changed' })
    if (action === 'abort') controller.abort()
    return extraction
  }, 'test')
  try {
    await assert.rejects(graph.refreshNext(new AbortController().signal), /note changed/)
    assert.equal(graph.snapshot().progress.completed, 0)
    action = 'abort'
    await assert.rejects(graph.refreshNext(controller.signal))
    assert.equal(graph.snapshot().progress.completed, 0)
    action = 'okay'
    await graph.refreshNext(new AbortController().signal)
    assert.equal(graph.snapshot().progress.completed, 1)
  } finally { graph.close(); notes.close(); await rm(directory, { recursive: true }) }
})

test('graph validation rejects invented excerpts, unknown endpoints, self-links, and duplicate concepts', async () => {
  assert.deepEqual(validateExtraction(extraction, text), extraction)
  for (const invalid of [
    { ...extraction, concepts: [{ label: 'Sleep', evidence: 'An invented quote' }] },
    { ...extraction, relationships: [{ ...extraction.relationships[0], target: 'Invented' }] },
    { ...extraction, relationships: [{ ...extraction.relationships[0], target: 'Sleep' }] },
    { ...extraction, concepts: [...extraction.concepts, { label: ' sleep ', evidence: 'Sleep' }] },
    { ...extraction, relationships: [...extraction.relationships, extraction.relationships[0]] },
  ]) assert.throws(() => validateExtraction(invalid, text), /could not be validated/)
  const extractor = createGraphExtractor({ apiKey: 'test', model: 'test', fetcher: async (_url, init) => {
    const request = JSON.parse(init?.body as string)
    assert.equal(request.text.format.name, 'note_graph')
    assert.match(request.instructions, /untrusted reference data/)
    assert.equal(request.store, false)
    assert.ok(!request.tools)
    return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(extraction) }] }] })
  } })
  assert.deepEqual(await extractor(text, new AbortController().signal), extraction)
  await assert.rejects(createGraphExtractor({ model: 'test' })(text, new AbortController().signal), /OPENAI_API_KEY/)
})

test('graph extraction retries invalid output once with specific feedback and schema bounds', async () => {
  let calls = 0
  const invalid = { ...extraction, concepts: [{ label: 'Sleep', evidence: 'Invented quote' }] }
  const extractor = createGraphExtractor({ apiKey: 'test', model: 'test', fetcher: async (_url, init) => {
    calls++
    const body = JSON.parse(init?.body as string)
    assert.equal(body.text.format.schema.properties.concepts.maxItems, 12)
    assert.equal(body.text.format.schema.properties.relationships.maxItems, 16)
    assert.equal(body.text.format.schema.properties.concepts.items.properties.evidence.maxLength, 400)
    if (calls === 2) {
      assert.match(body.input.at(-1).content, /concept 1 needs a verbatim source quote/)
      assert.match(body.input.at(-1).content, /without paraphrasing or ellipses/)
    }
    return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(calls === 1 ? invalid : extraction) }] }] })
  } })
  assert.deepEqual(await extractor(text, new AbortController().signal), extraction)
  assert.equal(calls, 2)
  calls = 0
  const alwaysInvalid = createGraphExtractor({ apiKey: 'test', model: 'test', fetcher: async () => {
    calls++
    return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(invalid) }] }] })
  } })
  await assert.rejects(alwaysInvalid(text, new AbortController().signal), /concept 1 needs a verbatim source quote/)
  assert.equal(calls, 2)
})

test('graph correction does not retry provider failures or continue after cancellation', async () => {
  let calls = 0
  const unavailable = createGraphExtractor({ apiKey: 'test', model: 'test', fetcher: async () => { calls++; return new Response('', { status: 500 }) } })
  await assert.rejects(unavailable(text, new AbortController().signal), /temporarily unavailable/)
  assert.equal(calls, 1)
  const controller = new AbortController()
  calls = 0
  const canceled = createGraphExtractor({ apiKey: 'test', model: 'test', fetcher: async () => {
    calls++
    controller.abort()
    return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: '{}' }] }] })
  } })
  await assert.rejects(canceled(text, controller.signal))
  assert.equal(calls, 1)
})
