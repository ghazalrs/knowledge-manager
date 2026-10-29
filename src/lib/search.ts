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

export function combinedSearchNotes(notes: Note[], query: string, semanticIds: string[] = [], folderId: string | null = null) {
  const local = searchWorkspace(notes, [], query, folderId).notes
  const term = normalize(query)
  if (!term) return local
  // Prefer title matches within the local ranking, then combine ranked positions.
  const keywords = [...local].sort((a, b) => Number(normalize(b.title).includes(term)) - Number(normalize(a.title).includes(term)))
  const available = new Map(notes.filter((note) => folderId === null || note.folderId === folderId).map((note) => [note.id, note]))
  const scores = new Map<string, number>()
  for (const ranking of [keywords.map((note) => note.id), [...new Set(semanticIds)]]) {
    ranking.forEach((id, index) => {
      if (available.has(id)) scores.set(id, (scores.get(id) ?? 0) + 1 / (61 + index))
    })
  }
  return [...scores].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id]) => available.get(id)!)
}
