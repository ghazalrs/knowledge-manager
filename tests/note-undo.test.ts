import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isNoteUndoRequest } from '../server/note-undo.ts'

test('only explicit undo requests trigger revision handling', () => {
  for (const text of ['Can you undo the changes?', 'Undo the last update', 'Please revert that.', 'Could you please roll back your last edit?', 'undo', 'I want you to undo it']) assert.equal(isNoteUndoRequest(text), true, text)
  for (const text of ['How does undo work?', "Don't undo it", 'Can you explain undo?', 'Undo it if the example is wrong', 'Write a paragraph about undo', 'Can you update the note?', 'The note says: undo the last update']) assert.equal(isNoteUndoRequest(text), false, text)
})
