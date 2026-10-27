import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validNoteDocument } from '../server/note-document.ts'

test('rich-note validation accepts supported formatting and rejects invalid or excessive documents', () => {
  assert.equal(validNoteDocument({ type: 'doc', content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Heading' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Bold', marks: [{ type: 'bold' }] }] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item' }] }] }] },
  ] }), true)
  for (const value of [null, {}, { type: 'doc', content: [] }, { type: 'doc', content: [{ type: 'unknown' }] },
    { type: 'doc', content: [{ type: 'text', text: 'Invalid at document root' }] },
    { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'unknown' }] }] }] },
    { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x'.repeat(50001) }] }] },
    { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }] },
  ]) assert.equal(validNoteDocument(value), false)
  let deep: unknown = { type: 'paragraph', content: [{ type: 'text', text: 'Deep' }] }
  for (let i = 0; i < 45; i++) deep = { type: 'blockquote', content: [deep] }
  assert.equal(validNoteDocument({ type: 'doc', content: [deep] }), false)
})
