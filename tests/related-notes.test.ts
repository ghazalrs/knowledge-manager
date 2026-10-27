import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Note } from '../src/types/note.ts'
import { findRelatedNotes } from '../server/related-notes.ts'
import { noteText, textDocument } from '../src/lib/note-text.ts'

const note = (id: string, title: string, body: string): Note => ({ id, title, content: textDocument(body), folderId: null, createdAt: 1 })

test('related notes use topic words, rank titles first, and bound complete note context', () => {
  const notes = [note('unrelated', 'Travel', 'Visit a garden'), note('body', 'Databases', 'SQLite stores local data'), note('title', 'SQLite', 'A local database'),
    note('large', 'SQLite SQLite', 'x'.repeat(16001)), note('late', 'Long reading', `${'ordinary '.repeat(100)} SQLite`)]
  assert.deepEqual(findRelatedNotes(notes, 'Please update my SQLite notes').map((item) => item.id), ['title', 'body', 'late'])
  assert.deepEqual(findRelatedNotes(notes, 'Please organize my notes'), [])
  assert.deepEqual(findRelatedNotes(notes, 'unmatched'), [])
  assert.equal(findRelatedNotes(Array.from({ length: 10 }, (_, i) => note(`n${i}`, 'SQLite', 'Details')), 'SQLite').length, 4)
  assert.equal(noteText(textDocument('First line\n\nLast line')), 'First line\n\nLast line')
})
