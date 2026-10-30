import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { NotesStore } from '../server/notes-store.ts'
import { GraphStore } from '../server/graph-store.ts'
import { noteGraph } from '../src/lib/note-graph.ts'
import { textDocument } from '../src/lib/note-text.ts'
import { graphNeighbors, searchGraphNodes } from '../src/lib/graph.ts'

test('note map explains shared ideas, persists choices, drops stale evidence, and removes deleted sources', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'note-map-'))
  const path = join(directory, 'test.sqlite')
  const notes = new NotesStore(path)
  for (const id of ['a', 'b', 'c']) notes.createNote({ id, title: id, content: textDocument(id === 'c' ? 'Monday' : 'Memory on Monday'), folderId: null, createdAt: 1 })
  const extract = async (text: string) => ({ concepts: [{ label: 'Monday', evidence: 'Monday' }, ...(text.includes('Memory') ? [{ label: 'Memory', evidence: 'Memory' }] : [])], relationships: [] })
  let store = new GraphStore(path, () => notes.loadNotes(), extract, 'test')
  try {
    while (store.snapshot().progress.pending) await store.refreshNext(new AbortController().signal)
    let map = noteGraph(store.snapshot())
    assert.equal(map.nodes.length, 3)
    assert.ok(map.nodes.every((node) => node.kind === 'note'))
    assert.equal(map.edges.length, 1)
    assert.equal(map.edges[0].label, 'Both discuss Memory')
    assert.deepEqual(new Set(map.edges[0].evidence.map((item) => item.noteId)), new Set(['a', 'b']))
    assert.deepEqual(searchGraphNodes(map, 'memory').map((node) => node.id), ['note:a', 'note:b'])
    assert.equal(noteGraph(store.decide('note:b', 'note:a', 'dismiss')).edges.length, 0)
    store.close(); store = new GraphStore(path, () => notes.loadNotes(), extract, 'test')
    assert.equal(noteGraph(store.snapshot()).edges.length, 0)
    assert.equal(noteGraph(store.decide('note:a', 'note:b', 'reset')).edges.length, 1)
    map = noteGraph(store.decide('note:a', 'note:c', 'keep'))
    assert.equal(map.edges.length, 2)
    assert.equal(map.edges.find((edge) => edge.target === 'note:c')?.label, 'You linked these notes')
    assert.equal(graphNeighbors(map, 'note:a')[0].id, 'note:c')
    store.decide('note:a', 'note:b', 'keep')
    notes.updateNote('b', { content: textDocument('Changed subject') })
    map = noteGraph(store.snapshot())
    assert.equal(map.edges.find((edge) => edge.target === 'note:b')?.evidence.length, 0)
    assert.equal(map.edges.find((edge) => edge.target === 'note:b')?.kept, true)
    assert.throws(() => store.decide('note:a', 'note:a', 'keep'), /different/)
    assert.throws(() => store.decide('note:a', 'note:missing', 'keep'), /different/)
    notes.deleteNote('a')
    assert.equal(noteGraph(store.snapshot()).edges.length, 0)
    assert.equal(store.snapshot().decisions, undefined)
  } finally { store.close(); notes.close(); await rm(directory, { recursive: true }) }
})
