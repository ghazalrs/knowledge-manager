import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { NotesStore } from '../server/notes-store.ts'

test('folders persist across reopening and upgrading a notes-only database preserves notes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'knowledge-manager-folders-'))
  const path = join(directory, 'notes.sqlite')
  const content = { type: 'doc', content: [{ type: 'paragraph' }] }
  const legacy = new DatabaseSync(path)
  legacy.exec('CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, createdAt INTEGER NOT NULL)')
  legacy.prepare('INSERT INTO notes VALUES (?, ?, ?, ?)').run('existing', 'Existing note', JSON.stringify(content), 1)
  legacy.close()
  let store = new NotesStore(path)
  const first = { id: 'first-folder', name: 'First', createdAt: 1 }
  const second = { id: 'second-folder', name: 'Second', createdAt: 2 }
  try {
    assert.deepEqual(store.loadFolders(), [])
    store.createFolder(first)
    store.createFolder(second)
    assert.equal(store.renameFolder(first.id, 'Renamed'), true)
    store.createFolder(first)
    store.close()
    store = new NotesStore(path)
    assert.deepEqual(store.loadFolders(), [second, { ...first, name: 'Renamed' }])
    store.deleteFolder(first.id)
    store.deleteFolder(first.id)
    assert.equal(store.renameFolder(first.id, 'Stale rename'), false)
    store.close()
    store = new NotesStore(path)
    assert.deepEqual(store.loadFolders(), [second])
    assert.deepEqual(store.loadNotes(), [{ id: 'existing', title: 'Existing note', content, createdAt: 1, folderId: null }])
    store.deleteFolder(second.id)
    assert.deepEqual(store.loadFolders(), [])
  } finally {
    store.close()
    await rm(directory, { recursive: true, force: true })
  }
})
