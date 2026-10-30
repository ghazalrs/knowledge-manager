import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import type { CardText, Flashcard, FlashcardDraft } from '../src/types/flashcard.ts'
import type { Note } from '../src/types/note.ts'
import { RequestError } from './api.ts'
import { fingerprint } from './semantic-search.ts'
import { validateCards } from './flashcard-generation.ts'

export class FlashcardStore {
  private db: DatabaseSync
  private loadNotes: () => Note[]
  constructor(path: string, loadNotes: () => Note[]) {
    this.loadNotes = loadNotes
    this.db = new DatabaseSync(path)
    this.db.exec(`PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS flashcards (
        id TEXT PRIMARY KEY, noteId TEXT REFERENCES notes(id) ON DELETE SET NULL,
        sourceTitle TEXT NOT NULL, sourceFingerprint TEXT NOT NULL,
        question TEXT NOT NULL, answer TEXT NOT NULL, createdAt INTEGER NOT NULL,
        reviewCount INTEGER NOT NULL DEFAULT 0, lastRating TEXT, lastReviewedAt INTEGER
      );`)
  }
  list(): Flashcard[] {
    return this.db.prepare('SELECT * FROM flashcards ORDER BY createdAt DESC, id').all() as Flashcard[]
  }
  source(noteId: string) {
    const note = this.loadNotes().find((item) => item.id === noteId)
    if (!note) throw new RequestError(404, 'Source note no longer exists.')
    return note
  }
  async generate(noteId: string, generate: (note: Note, signal: AbortSignal) => Promise<CardText[]>, signal: AbortSignal): Promise<FlashcardDraft> {
    const note = this.source(noteId)
    const sourceFingerprint = fingerprint(note)
    const cards = validateCards(await generate(note, signal), 502)
    signal.throwIfAborted()
    if (fingerprint(this.source(noteId)) !== sourceFingerprint) throw new RequestError(409, 'The note changed during generation. Generate again using the saved version.')
    return { noteId, sourceTitle: note.title, sourceFingerprint, cards }
  }
  save(noteId: string, sourceFingerprint: string, input: unknown) {
    const cards = validateCards(input)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const note = this.source(noteId)
      if (fingerprint(note) !== sourceFingerprint) throw new RequestError(409, 'The source note changed. Generate a fresh preview before saving.')
      const insert = this.db.prepare('INSERT INTO flashcards (id, noteId, sourceTitle, sourceFingerprint, question, answer, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      const createdAt = Date.now()
      for (const card of cards) {
        // Repeated save requests must not duplicate an approved card.
        if (!this.db.prepare('SELECT id FROM flashcards WHERE noteId = ? AND sourceFingerprint = ? AND question = ? AND answer = ?').get(noteId, sourceFingerprint, card.question, card.answer)) {
          insert.run(randomUUID(), noteId, note.title, sourceFingerprint, card.question, card.answer, createdAt)
        }
      }
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
    return this.list()
  }
  review(id: string, rating: 'again' | 'got-it') {
    if (!this.db.prepare('UPDATE flashcards SET reviewCount = reviewCount + 1, lastRating = ?, lastReviewedAt = ? WHERE id = ?').run(rating, Date.now(), id).changes) throw new RequestError(404, 'Flashcard no longer exists.')
  }
  delete(id: string) { this.db.prepare('DELETE FROM flashcards WHERE id = ?').run(id) }
  close() { this.db.close() }
}
