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

test('word variations, accent differences, and short technical terms retrieve their topics', () => {
  const notes = [note('closures', 'JavaScript closure', 'A function remembers its lexical scope.'), note('study', 'Study plan', 'Review one topic a day.'),
    note('cache', 'Cache design', 'Store the calculated result.'), note('cafe', 'Café research', 'Résumé examples'), note('ai', 'AI models', 'A local assistant')]
  assert.equal(findRelatedNotes(notes, 'JavaScript closures')[0]?.id, 'closures')
  assert.equal(findRelatedNotes(notes, 'studies')[0]?.id, 'study')
  assert.equal(findRelatedNotes(notes, 'caching stored results')[0]?.id, 'cache')
  assert.equal(findRelatedNotes(notes, 'cafe resume')[0]?.id, 'cafe')
  assert.equal(findRelatedNotes(notes, 'AI')[0]?.id, 'ai')
})

test('specific topic coverage outranks a repeated generic word and unrelated notes are excluded', () => {
  const notes = [note('noise', 'Data archive', 'data '.repeat(1000)), note('specific', 'JavaScript closure', 'Functions retain scope and data.'),
    note('unrelated', 'Garden planning', 'Plant tomatoes in spring')]
  assert.equal(findRelatedNotes(notes, 'JavaScript closures data')[0]?.id, 'specific')
  assert.ok(!findRelatedNotes(notes, 'JavaScript closures data').some((item) => item.id === 'unrelated'))
})

test('short follow-ups use recent user topics while explicit topic changes do not inherit them', () => {
  const notes = [note('sqlite', 'SQLite', 'Local storage'), note('kyoto', 'Kyoto travel', 'A city itinerary'), note('old', 'Gardening', 'Plants')]
  assert.deepEqual(findRelatedNotes(notes, 'Add this too', ['Explain SQLite']).map((item) => item.id), ['sqlite'])
  assert.equal(findRelatedNotes(notes, 'It also supports transactions', ['Explain SQLite'])[0]?.id, 'sqlite')
  assert.equal(findRelatedNotes(notes, 'Tell me more', ['Gardening', 'SQLite'])[0]?.id, 'sqlite')
  assert.deepEqual(findRelatedNotes(notes, 'Instead, add more about Kyoto travel', ['Explain SQLite']).map((item) => item.id), ['kyoto'])
  assert.deepEqual(findRelatedNotes(notes, 'Kyoto travel itinerary', ['Explain SQLite']).map((item) => item.id), ['kyoto'])
  assert.deepEqual(findRelatedNotes(notes, 'Add this too'), [])
  assert.deepEqual(findRelatedNotes(notes, 'Add this too', ['Gardening', 'unmatched', 'unmatched', 'unmatched']), [])
})
