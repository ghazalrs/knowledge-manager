import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { NotesStore } from '../server/notes-store.ts'
import type { Note } from '../src/types/note.ts'

test('SQLite preserves formatting, order, renames and deletions after reopening', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'knowledge-manager-test-'))
  const path = join(directory, 'notes.sqlite')
  let store = new NotesStore(path)
  const first: Note = {
    id: 'first', title: 'First', createdAt: 1,
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
  }
  const second: Note = { ...first, id: 'second', title: 'Second', createdAt: 2 }
  const content: Note['content'] = {
    type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Remember this', marks: [{ type: 'bold' }] }] }],
  }
  try {
    store.createNote(first)
    store.createNote(second)
    store.updateNote(first.id, { content })
    store.updateNote(first.id, { title: 'Renamed' })
    // A repeated creation after a timeout cannot overwrite the edited note.
    store.createNote(first)
    store.close()
    store = new NotesStore(path)
    assert.deepEqual(store.loadNotes(), [second, { ...first, title: 'Renamed', content }])
    store.deleteNote(first.id)
    assert.equal(store.updateNote(first.id, { title: 'Stale edit' }), false)
    store.deleteNote(second.id)
    store.close()
    store = new NotesStore(path)
    assert.deepEqual(store.loadNotes(), [])
  } finally {
    store.close()
    await rm(directory, { recursive: true, force: true })
  }
})
