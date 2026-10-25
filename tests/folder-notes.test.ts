import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { NotesStore } from '../server/notes-store.ts'
import type { Note } from '../src/types/note.ts'

test('moves persist without changing content and deletion follows the saved destination', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'knowledge-manager-move-'))
  const path = join(directory, 'notes.sqlite')
  let store = new NotesStore(path)
  const note: Note = {
    id: 'moving', title: 'Keep this title', createdAt: 1, folderId: null,
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep this content', marks: [{ type: 'bold' }] }] }] },
  }
  try {
    store.createFolder({ id: 'first', name: 'First', createdAt: 1 })
    store.createFolder({ id: 'second', name: 'Second', createdAt: 2 })
    store.createNote(note)
    assert.equal(store.updateNote(note.id, { folderId: 'first' }), true)
    store.close()
    store = new NotesStore(path)
    assert.deepEqual(store.loadNotes(), [{ ...note, folderId: 'first' }])
    assert.equal(store.updateNote(note.id, { folderId: 'missing' }), false)
    assert.deepEqual(store.loadNotes(), [{ ...note, folderId: 'first' }])
    store.updateNote(note.id, { folderId: 'second' })
    store.deleteFolder('first')
    assert.deepEqual(store.loadNotes(), [{ ...note, folderId: 'second' }])
    store.updateNote(note.id, { folderId: null })
    store.close()
    store = new NotesStore(path)
    store.deleteFolder('second')
    assert.deepEqual(store.loadNotes(), [note])
    store.createFolder({ id: 'last', name: 'Last', createdAt: 3 })
    store.updateNote(note.id, { folderId: 'last' })
    store.deleteFolder('last')
    assert.deepEqual(store.loadNotes(), [])
  } finally {
    store.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('migrated databases persist folder notes and cascade deletion without touching other notes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'knowledge-manager-folder-notes-'))
  const path = join(directory, 'notes.sqlite')
  const content = { type: 'doc', content: [{ type: 'paragraph' }] }
  const legacy = new DatabaseSync(path)
  legacy.exec(`
    CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, createdAt INTEGER NOT NULL);
    CREATE TABLE folders (id TEXT PRIMARY KEY, name TEXT NOT NULL, createdAt INTEGER NOT NULL);
  `)
  legacy.prepare('INSERT INTO notes VALUES (?, ?, ?, ?)').run('legacy', 'Existing note', JSON.stringify(content), 1)
  legacy.prepare('INSERT INTO folders VALUES (?, ?, ?)').run('first-folder', 'Existing folder', 1)
  legacy.close()
  let store = new NotesStore(path)
  const root: Note = { id: 'root', title: 'Top level', content, createdAt: 2, folderId: null }
  const inside: Note = { ...root, id: 'inside', createdAt: 3, folderId: 'first-folder' }
  const sibling: Note = { ...inside, id: 'sibling', createdAt: 4 }
  const other: Note = { ...inside, id: 'other', createdAt: 5, folderId: 'other-folder' }
  try {
    store.createFolder({ id: 'other-folder', name: 'Other', createdAt: 2 })
    assert.equal(store.createNote(root), true)
    assert.equal(store.createNote(inside), true)
    store.createNote(sibling)
    store.createNote(other)
    store.updateNote(inside.id, { title: 'Renamed inside' })
    store.close()
    store = new NotesStore(path)
    assert.deepEqual(store.loadNotes().find((note) => note.id === inside.id), { ...inside, title: 'Renamed inside' })
    assert.equal(store.loadNotes().find((note) => note.id === 'legacy')?.folderId, null)
    store.deleteFolder('first-folder')
    store.deleteFolder('first-folder')
    assert.equal(store.createNote({ ...inside, id: 'stale-create' }), false)
    assert.equal(store.updateNote(inside.id, { title: 'Stale edit' }), false)
    store.close()
    store = new NotesStore(path)
    assert.deepEqual(store.loadNotes().map((note) => note.id), ['other', 'root', 'legacy'])
    assert.deepEqual(store.loadFolders().map((folder) => folder.id), ['other-folder'])
    store.deleteFolder('other-folder')
    assert.deepEqual(store.loadNotes().map((note) => note.id), ['root', 'legacy'])
  } finally {
    store.close()
    await rm(directory, { recursive: true, force: true })
  }
})
