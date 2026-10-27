import type { Note } from '../types/note.ts'

export function noteText(node: Note['content']): string {
  if (typeof node.text === 'string') return node.text
  if (node.type === 'hardBreak') return '\n'
  const inline = ['paragraph', 'heading', 'codeBlock'].includes(node.type ?? '')
  return node.content?.map(noteText).join(inline ? '' : '\n') ?? ''
}

export function textDocument(content: string): Note['content'] {
  return { type: 'doc', content: content.split('\n').map((line) => ({ type: 'paragraph', ...(line ? { content: [{ type: 'text', text: line }] } : {}) })) }
}
