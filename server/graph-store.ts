import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import type { Note } from '../src/types/note.ts'
import type { GraphDecision, GraphEdge, GraphNode, KnowledgeGraph, NoteGraphExtraction } from '../src/types/graph.ts'
import { fingerprint, passages, semanticText } from './semantic-search.ts'
import { normalizedLabel, validateExtraction, type ExtractGraph } from './graph-extraction.ts'
import { RequestError } from './api.ts'

export function graphChunks(note: Note) {
  const parts = passages(semanticText(note))
  // Remove internal overlap rather than inserting repeated text into a quotation.
  // Each portion is now a contiguous substring of the original note.
  return Array.from({ length: Math.ceil(parts.length / 4) }, (_, index) => parts.slice(index * 4, index * 4 + 4)
    .map((part, offset) => offset ? Array.from(part).slice(50).join('') : part).join(''))
}

const identifier = (parts: string[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 24)
const conceptId = (label: string) => `concept:${identifier([normalizedLabel(label)])}`
type Piece = { note: Note; index: number; text: string; hash: string; extraction?: NoteGraphExtraction }

export class GraphStore {
  private db: DatabaseSync
  private loadNotes: () => Note[]
  private extract: ExtractGraph
  private recipe: string
  private busy = false

  constructor(path: string, loadNotes: () => Note[], extract: ExtractGraph, model: string) {
    this.loadNotes = loadNotes
    this.extract = extract
    this.recipe = `note-graph-v2:contiguous-2000x4:${model}`
    this.db = new DatabaseSync(path)
    this.db.exec(`PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS note_graph_chunks (
        noteId TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        chunkIndex INTEGER NOT NULL, fingerprint TEXT NOT NULL, recipe TEXT NOT NULL, extraction TEXT NOT NULL,
        PRIMARY KEY(noteId, chunkIndex)
      );
      CREATE TABLE IF NOT EXISTS note_graph_decisions (
        source TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        target TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        action TEXT NOT NULL CHECK(action IN ('keep', 'dismiss')),
        PRIMARY KEY(source, target), CHECK(source < target)
      );`)
  }

  private plan() {
    const notes = this.loadNotes()
    const rows = new Map(this.db.prepare('SELECT * FROM note_graph_chunks').all().map((row) => [`${row.noteId}:${row.chunkIndex}`, row]))
    const pieces: Piece[] = notes.flatMap((note) => {
      const hash = fingerprint(note)
      return graphChunks(note).map((text, index) => {
        const row = rows.get(`${note.id}:${index}`)
        let extraction: NoteGraphExtraction | undefined
        if (row && row.fingerprint === hash && row.recipe === this.recipe) {
          try { extraction = validateExtraction(validateExtraction(JSON.parse(row.extraction as string), text), semanticText(note)) } catch { /* Rebuild damaged derived data. */ }
        }
        return { note, index, text, hash, extraction }
      })
    })
    return { notes, pieces }
  }

  snapshot(): KnowledgeGraph {
    const { notes, pieces } = this.plan()
    const nodes = new Map<string, GraphNode>(notes.map((note) => [`note:${note.id}`, { id: `note:${note.id}`, kind: 'note', label: note.title, noteId: note.id }]))
    const edges = new Map<string, GraphEdge>()
    for (const piece of pieces) {
      if (!piece.extraction) continue
      const addEdge = (source: string, target: string, label: string, kind: GraphEdge['kind'], quote: string) => {
        const id = `edge:${identifier([source, target, normalizedLabel(label), kind])}`
        const edge = edges.get(id) ?? { id, source, target, label, kind, evidence: [] }
        if (!edge.evidence.some((item) => item.noteId === piece.note.id && item.quote === quote)) {
          edge.evidence.push({ noteId: piece.note.id, title: piece.note.title, quote })
        }
        edges.set(id, edge)
      }
      for (const concept of piece.extraction.concepts) {
        const id = conceptId(concept.label)
        if (!nodes.has(id)) nodes.set(id, { id, kind: 'concept', label: concept.label })
        addEdge(`note:${piece.note.id}`, id, 'mentions', 'mentions', concept.evidence)
      }
      for (const relationship of piece.extraction.relationships) {
        addEdge(conceptId(relationship.source), conceptId(relationship.target), relationship.label, 'relationship', relationship.evidence)
      }
    }
    const completed = pieces.filter((piece) => piece.extraction).length
    const decisions = this.db.prepare('SELECT source, target, action FROM note_graph_decisions ORDER BY source, target').all()
      .map((row) => ({ source: `note:${row.source}`, target: `note:${row.target}`, action: row.action as GraphDecision['action'] }))
    return { nodes: [...nodes.values()], edges: [...edges.values()], progress: { completed, total: pieces.length, pending: pieces.length - completed }, ...(decisions.length ? { decisions } : {}) }
  }

  decide(source: string, target: string, action: 'keep' | 'dismiss' | 'reset') {
    const ids = new Set(this.loadNotes().map((note) => `note:${note.id}`))
    if (source === target || !ids.has(source) || !ids.has(target)) throw new RequestError(400, 'Choose two different saved notes.')
    const [a, b] = [source.slice(5), target.slice(5)].sort()
    if (action === 'reset') this.db.prepare('DELETE FROM note_graph_decisions WHERE source = ? AND target = ?').run(a, b)
    else this.db.prepare('INSERT INTO note_graph_decisions VALUES (?, ?, ?) ON CONFLICT(source, target) DO UPDATE SET action = excluded.action').run(a, b, action)
    return this.snapshot()
  }

  async refreshNext(signal: AbortSignal): Promise<KnowledgeGraph> {
    if (this.busy) throw new RequestError(409, 'Graph extraction is already running. Retry shortly.')
    this.busy = true
    try {
      signal.throwIfAborted()
      const next = this.plan().pieces.find((piece) => !piece.extraction)
      if (!next) return this.snapshot()
      const extraction = validateExtraction(validateExtraction(await this.extract(next.text, signal), next.text), semanticText(next.note))
      signal.throwIfAborted()
      const current = this.loadNotes().find((note) => note.id === next.note.id)
      if (!current || fingerprint(current) !== next.hash) throw new RequestError(409, 'A note changed while extracting the graph. Retry to use the latest saved text.')
      // No database lock spans the model call. Each completed chunk is saved atomically.
      this.db.prepare(`INSERT INTO note_graph_chunks VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(noteId, chunkIndex) DO UPDATE SET fingerprint = excluded.fingerprint, recipe = excluded.recipe, extraction = excluded.extraction`)
        .run(next.note.id, next.index, next.hash, this.recipe, JSON.stringify(extraction))
      this.db.prepare('DELETE FROM note_graph_chunks WHERE noteId = ? AND (fingerprint != ? OR recipe != ? OR chunkIndex >= ?)')
        .run(next.note.id, next.hash, this.recipe, graphChunks(current).length)
      return this.snapshot()
    } finally { this.busy = false }
  }

  close() { this.db.close() }
}
