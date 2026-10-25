import type { Note, NoteChanges } from '@/types/note'
import { request } from '@/lib/api-client'

export const notesApi = {
  async loadNotes(): Promise<Note[]> { return (await request('/notes')).json() },
  async createNote(note: Note) { await request('/notes', 'POST', note) },
  async updateNote(id: string, changes: NoteChanges) { await request(`/notes/${encodeURIComponent(id)}`, 'PATCH', changes) },
  async deleteNote(id: string) { await request(`/notes/${encodeURIComponent(id)}`, 'DELETE') },
}
