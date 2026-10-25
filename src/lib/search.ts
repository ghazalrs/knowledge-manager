import type { Note } from '../types/note.ts'
import type { Folder } from '../types/folder.ts'

function plainText(node: Note['content']): string {
  if (typeof node.text === 'string') return node.text
  if (node.type === 'hardBreak') return ' '
  const inlineContent = node.type === 'paragraph' || node.type === 'heading' || node.type === 'codeBlock'
  return node.content?.map(plainText).join(inlineContent ? '' : ' ') ?? ''
}

function normalize(value: string) {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

export function searchWorkspace(notes: Note[], folders: Folder[], query: string, folderId: string | null = null) {
  const term = normalize(query)
  return {
    folders: folders.filter((folder) => !term || normalize(folder.name).includes(term)),
    notes: notes.filter((note) => (folderId === null || note.folderId === folderId)
      && (!term || normalize(note.title).includes(term) || normalize(plainText(note.content)).includes(term))),
  }
}
