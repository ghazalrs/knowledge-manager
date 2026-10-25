import { DatabaseSync } from 'node:sqlite'
import type { Note, NoteChanges } from '../src/types/note.ts'

export class NotesStore {
  private db: DatabaseSync

  constructor(path: string) {
    this.db = new DatabaseSync(path)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        createdAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS notes_created_at ON notes(createdAt);
    `)
  }

  loadNotes(): Note[] {
    return this.db.prepare('SELECT * FROM notes ORDER BY createdAt DESC, id DESC').all().map((row) => ({
      id: row.id as string,
      title: row.title as string,
      content: JSON.parse(row.content as string),
      createdAt: row.createdAt as number,
    }))
  }

  createNote(note: Note) {
    // Retrying a creation must not overwrite later edits to the same note.
    this.db.prepare('INSERT INTO notes (id, title, content, createdAt) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING')
      .run(note.id, note.title, JSON.stringify(note.content), note.createdAt)
  }

  updateNote(id: string, changes: NoteChanges) {
    const fields: string[] = []
    const values: string[] = []
    if (changes.title !== undefined) { fields.push('title = ?'); values.push(changes.title) }
    if (changes.content !== undefined) { fields.push('content = ?'); values.push(JSON.stringify(changes.content)) }
    const result = this.db.prepare(`UPDATE notes SET ${fields.join(', ')} WHERE id = ?`).run(...values, id)
    return result.changes > 0
  }

  deleteNote(id: string) {
    this.db.prepare('DELETE FROM notes WHERE id = ?').run(id)
  }

  close() {
    this.db.close()
  }
}
