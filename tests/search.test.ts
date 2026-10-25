import assert from 'node:assert/strict'
import { test } from 'node:test'
import { searchWorkspace } from '../src/lib/search.ts'
import type { Note } from '../src/types/note.ts'

const folders = [{ id: 'biology', name: 'Biology', createdAt: 1 }, { id: 'math', name: 'Math', createdAt: 2 }]
const notes: Note[] = [
  {
    id: 'cell', title: 'Cell structures', folderId: 'biology', createdAt: 1,
    content: { type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Photo' }, { type: 'text', text: 'synthesis', marks: [{ type: 'bold' }] }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'uses sunlight' }] },
    ] },
  },
  { id: 'algebra', title: 'Algebra', folderId: 'math', createdAt: 2, content: { type: 'doc', content: [{ type: 'paragraph' }] } },
  { id: 'root', title: 'Sunlight diary', folderId: null, createdAt: 3, content: { type: 'doc', content: [] } },
]

test('search matches titles, folder names and formatted text, with normalized whitespace and case', () => {
  assert.deepEqual(searchWorkspace(notes, folders, '  BIOLOGY ').folders, [folders[0]])
  assert.deepEqual(searchWorkspace(notes, folders, 'ALGEBRA').notes, [notes[1]])
  assert.deepEqual(searchWorkspace(notes, folders, 'photosynthesis   uses').notes, [notes[0]])
  assert.deepEqual(searchWorkspace(notes, folders, 'sunlight').notes, [notes[0], notes[2]])
})

test('search respects the selected folder and clearing restores the scoped list', () => {
  assert.deepEqual(searchWorkspace(notes, folders, 'sunlight', 'biology').notes, [notes[0]])
  assert.deepEqual(searchWorkspace(notes, folders, 'sunlight', 'math').notes, [])
  assert.deepEqual(searchWorkspace(notes, folders, '', 'math').notes, [notes[1]])
  assert.deepEqual(searchWorkspace(notes, folders, '   '), { notes, folders })
  assert.deepEqual(searchWorkspace(notes, folders, 'nonexistent'), { notes: [], folders: [] })
})
