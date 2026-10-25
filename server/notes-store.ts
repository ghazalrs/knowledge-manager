import { DatabaseSync } from 'node:sqlite'
import type { Note, NoteChanges } from '../src/types/note.ts'
import type { Folder } from '../src/types/folder.ts'

export class NotesStore {
  private db: DatabaseSync

  constructor(path: string) {
    this.db = new DatabaseSync(path)
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        createdAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS notes_created_at ON notes(createdAt);
      CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        createdAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS folders_created_at ON folders(createdAt);
    `)
    // A NULL default keeps pre-existing notes at the top level.
    this.db.exec('BEGIN IMMEDIATE')
    try {
      if (!this.db.prepare('PRAGMA table_info(notes)').all().some((column) => column.name === 'folderId')) {
        this.db.exec('ALTER TABLE notes ADD COLUMN folderId TEXT DEFAULT NULL REFERENCES folders(id) ON DELETE CASCADE')
      }
      this.db.exec('CREATE INDEX IF NOT EXISTS notes_folder_id ON notes(folderId); COMMIT;')
    } catch (error) {
      this.db.exec('ROLLBACK')
      this.db.close()
      throw error
    }
  }

  loadNotes(): Note[] {
    return this.db.prepare('SELECT * FROM notes ORDER BY createdAt DESC, id DESC').all().map((row) => ({
      id: row.id as string,
      title: row.title as string,
      content: JSON.parse(row.content as string),
      createdAt: row.createdAt as number,
      folderId: row.folderId as string | null,
    }))
  }

  createNote(note: Note) {
    if (note.folderId !== null && !this.db.prepare('SELECT id FROM folders WHERE id = ?').get(note.folderId)) return false
    // Retrying a creation must not overwrite later edits to the same note.
    this.db.prepare('INSERT INTO notes (id, title, content, createdAt, folderId) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING')
      .run(note.id, note.title, JSON.stringify(note.content), note.createdAt, note.folderId)
    return true
  }

  updateNote(id: string, changes: NoteChanges) {
    if (changes.folderId !== undefined && changes.folderId !== null && !this.hasFolder(changes.folderId)) return false
    const fields: string[] = []
    const values: (string | null)[] = []
    if (changes.title !== undefined) { fields.push('title = ?'); values.push(changes.title) }
    if (changes.content !== undefined) { fields.push('content = ?'); values.push(JSON.stringify(changes.content)) }
    if (changes.folderId !== undefined) { fields.push('folderId = ?'); values.push(changes.folderId) }
    const result = this.db.prepare(`UPDATE notes SET ${fields.join(', ')} WHERE id = ?`).run(...values, id)
    return result.changes > 0
  }

  deleteNote(id: string) {
    this.db.prepare('DELETE FROM notes WHERE id = ?').run(id)
  }

  loadFolders(): Folder[] {
    return this.db.prepare('SELECT * FROM folders ORDER BY createdAt DESC, id DESC').all().map((row) => ({
      id: row.id as string, name: row.name as string, createdAt: row.createdAt as number,
    }))
  }

  hasFolder(id: string) {
    return !!this.db.prepare('SELECT id FROM folders WHERE id = ?').get(id)
  }

  createFolder(folder: Folder) {
    this.db.prepare('INSERT INTO folders (id, name, createdAt) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING')
      .run(folder.id, folder.name, folder.createdAt)
  }

  renameFolder(id: string, name: string) {
    return this.db.prepare('UPDATE folders SET name = ? WHERE id = ?').run(name, id).changes > 0
  }

  deleteFolder(id: string) {
    this.db.prepare('DELETE FROM folders WHERE id = ?').run(id)
  }

  close() {
    this.db.close()
  }
}
