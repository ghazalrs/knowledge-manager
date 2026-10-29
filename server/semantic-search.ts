import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import type { Note } from '../src/types/note.ts'
import { noteText } from '../src/lib/note-text.ts'
import { RequestError } from './api.ts'
import { embeddingModel, validVector, type Embed } from './embeddings.ts'

// A byte bound is conservative even for languages with many tokens per character.
// Version the recipe so future chunking/model changes cannot reuse incompatible vectors.
const recipe = `${embeddingModel}:utf8-2000-overlap-200:v1`
export function semanticText(note: Note) { return `${note.title.trim()}\n\n${noteText(note.content).trim()}`.trim() }
export function fingerprint(note: Note) { return createHash('sha256').update(semanticText(note)).digest('hex') }

export function passages(text: string): string[] {
  const chunks: string[] = []
  let chunk = ''
  let bytes = 0
  for (const character of text) {
    const size = Buffer.byteLength(character)
    if (bytes + size > 2000) {
      chunks.push(chunk)
      chunk = Array.from(chunk).slice(-50).join('')
      bytes = Buffer.byteLength(chunk)
    }
    chunk += character
    bytes += size
  }
  if (chunk.trim()) chunks.push(chunk)
  return chunks
}

export function similarity(a: number[], b: number[]) {
  if (a.length !== b.length) throw new RequestError(502, 'Embedding dimensions changed. Rebuild the search index by restarting the server with a consistent model.')
  return a.reduce((sum, value, index) => sum + value * b[index], 0) / (Math.hypot(...a) * Math.hypot(...b))
}

export class SemanticSearch {
  private db: DatabaseSync
  private loadNotes: () => Note[]
  private embed: Embed
  private busy = false

  constructor(path: string, loadNotes: () => Note[], embed: Embed) {
    this.loadNotes = loadNotes
    this.embed = embed
    this.db = new DatabaseSync(path)
    this.db.exec(`PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS note_embeddings (
        noteId TEXT PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
        fingerprint TEXT NOT NULL, recipe TEXT NOT NULL, passages TEXT NOT NULL, vectors TEXT NOT NULL
      );`)
  }

  async search(query: string, folderId: string | null, signal: AbortSignal) {
    if (this.busy) throw new RequestError(409, 'Another semantic search is running. Please retry shortly.')
    this.busy = true
    try {
      const notes = this.loadNotes().filter((note) => folderId === null || note.folderId === folderId)
      const indexed: { note: Note; hash: string; chunks: string[]; vectors: number[][] }[] = []
      let refreshed = 0
      for (const note of notes) {
        signal.throwIfAborted()
        const hash = fingerprint(note)
        const chunks = passages(semanticText(note))
        const row = this.db.prepare('SELECT * FROM note_embeddings WHERE noteId = ? AND fingerprint = ? AND recipe = ?').get(note.id, hash, recipe)
        let vectors: number[][] | undefined
        if (row) {
          try {
            const cached: unknown = JSON.parse(row.vectors as string)
            if (Array.isArray(cached) && cached.length === chunks.length && cached.every(validVector)) vectors = cached
          } catch { /* Regenerate a damaged cache rather than treating it as note data. */ }
        }
        if (!vectors) {
          vectors = []
          for (let offset = 0; offset < chunks.length; offset += 16) {
            signal.throwIfAborted()
            vectors.push(...await this.embed(chunks.slice(offset, offset + 16), signal))
          }
          // No transaction spans a network request. Only cache a complete, still-current note.
          const current = this.loadNotes().find((item) => item.id === note.id)
          if (!current || fingerprint(current) !== hash) continue
          this.db.prepare(`INSERT INTO note_embeddings VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(noteId) DO UPDATE SET fingerprint = excluded.fingerprint, recipe = excluded.recipe,
            passages = excluded.passages, vectors = excluded.vectors`).run(note.id, hash, recipe, JSON.stringify(chunks), JSON.stringify(vectors))
          refreshed++
        }
        indexed.push({ note, hash, chunks, vectors })
      }
      if (!indexed.length) return { results: [], refreshed, searched: 0 }
      const [queryVector] = await this.embed([query], signal)
      signal.throwIfAborted()
      const current = new Map(this.loadNotes().map((note) => [note.id, note]))
      const results = indexed.flatMap(({ note, hash, chunks, vectors }) => {
        const latest = current.get(note.id)
        if (!latest || fingerprint(latest) !== hash || (folderId !== null && latest.folderId !== folderId)) return []
        let best = -Infinity
        let excerpt = ''
        vectors.forEach((vector, index) => {
          const score = similarity(queryVector, vector)
          if (score > best) { best = score; excerpt = chunks[index].slice(0, 300) }
        })
        // Similarity is a ranking signal, not a calibrated probability of relevance.
        return best >= 0.25 ? [{ noteId: note.id, score: best, excerpt }] : []
      }).sort((a, b) => b.score - a.score || a.noteId.localeCompare(b.noteId)).slice(0, 20)
      return { results, refreshed, searched: indexed.length }
    } finally { this.busy = false }
  }

  close() { this.db.close() }
}
