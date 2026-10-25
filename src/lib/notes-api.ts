import type { Note, NoteChanges } from '@/types/note'

async function request(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`/api/notes${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error(`Could not ${method === 'GET' ? 'load' : 'save'} notes (${response.status})`)
  return response
}

export const notesApi = {
  async loadNotes(): Promise<Note[]> { return (await request('')).json() },
  async createNote(note: Note) { await request('', 'POST', note) },
  async updateNote(id: string, changes: NoteChanges) { await request(`/${encodeURIComponent(id)}`, 'PATCH', changes) },
  async deleteNote(id: string) { await request(`/${encodeURIComponent(id)}`, 'DELETE') },
}
