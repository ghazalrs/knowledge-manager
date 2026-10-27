import { getSchema } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import type { Note } from '../src/types/note.ts'
import { noteText } from '../src/lib/note-text.ts'
import { isObject } from './api.ts'

const schema = getSchema([StarterKit.configure({ heading: { levels: [2] } })])

export function validNoteDocument(value: unknown, allowEmpty = false): value is Note['content'] {
  let count = 0
  function bounded(node: unknown, depth: number): boolean {
    if (++count > 10000 || depth > 40 || !isObject(node)) return false
    if (node.content !== undefined && (!Array.isArray(node.content) || !node.content.every((child) => bounded(child, depth + 1)))) return false
    if (node.marks !== undefined && (!Array.isArray(node.marks) || !node.marks.every((mark) => bounded(mark, depth + 1)))) return false
    if (isObject(node.attrs) && typeof node.attrs.href === 'string' && !/^(https?:|mailto:|tel:|\/|#)/i.test(node.attrs.href)) return false
    return true
  }
  try {
    if (!bounded(value, 0) || !isObject(value) || value.type !== 'doc' || !Array.isArray(value.content)) return false
    schema.nodeFromJSON(value).check()
    const text = noteText(value as Note['content'])
    return (allowEmpty || text.trim().length > 0) && text.length <= 50000
  } catch { return false }
}
