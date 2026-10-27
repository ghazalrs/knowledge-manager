import type { Note } from '../src/types/note.ts'
import { noteText } from '../src/lib/note-text.ts'

const ignored = new Set('a an and are as at be been but by can could do for from had has have i in into is it its me my note notes of on or organize please should that the their these this to update was we were what when which with would you your'.split(' '))
const words = (text: string) => [...new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((word) => word.length > 2 && !ignored.has(word)))]

export function findRelatedNotes(notes: Note[], query: string): Note[] {
  const terms = words(query).slice(0, 80)
  return notes.map((note) => {
    const title = new Set(words(note.title))
    const content = noteText(note.content)
    const body = new Set(words(content))
    const score = terms.reduce((sum, term) => sum + (title.has(term) ? 4 : 0) + (body.has(term) ? 1 : 0), 0)
    // Only send complete notes that fit the context budget; never merge from a truncated original.
    return { note, score: content.length <= 16000 ? score : 0 }
  }).filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.note.createdAt - a.note.createdAt || a.note.id.localeCompare(b.note.id))
    .slice(0, 4).map(({ note }) => note)
}
