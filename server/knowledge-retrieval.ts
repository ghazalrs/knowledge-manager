import type { Note } from '../src/types/note.ts'
import type { ChatMode } from '../src/types/chat.ts'
import { noteText, textDocument } from '../src/lib/note-text.ts'
import { findRelatedNotes, retrievalQuery } from './related-notes.ts'
import { fingerprint, passages, semanticText, type SemanticSearch } from './semantic-search.ts'

export type KnowledgeMatch = { note: Note; passages: string[] }
export type RetrievalResult = { matches: KnowledgeMatch[]; warning?: string }
export type Retrieve = (query: string, recentUserMessages: string[], mode: ChatMode) => Promise<RetrievalResult>

function boundedQuery(text: string) {
  // Keep the newest request first if earlier conversation text exceeds the budget.
  let result = ''
  for (const character of text) {
    if (Buffer.byteLength(result + character) > 2000) break
    result += character
  }
  return result
}

export function createKnowledgeRetriever(loadNotes: () => Note[], semantic: Pick<SemanticSearch, 'search'>): Retrieve {
  return async (query, recent, mode) => {
    const snapshot = loadNotes()
    if (!snapshot.length) return { matches: [] }
    const hashes = new Map(snapshot.map((note) => [note.id, fingerprint(note)]))
    // Rank passages too: exact words near the end of long notes must remain searchable.
    const documents = snapshot.flatMap((note) => passages(semanticText(note)).map((text, index) => ({
      ...note, id: `${note.id}:${index}`, content: textDocument(text),
    })))
    const keywords = findRelatedNotes(documents, query, recent, 24)
    const keywordNotes = new Map<string, string[]>()
    for (const doc of keywords) {
      const id = doc.id.slice(0, doc.id.lastIndexOf(':'))
      const texts = keywordNotes.get(id) ?? []
      if (texts.length < 3) texts.push(noteText(doc.content))
      keywordNotes.set(id, texts)
    }
    let semanticMatches: Awaited<ReturnType<SemanticSearch['search']>>['results'] = []
    let warning: string | undefined
    try {
      const expanded = retrievalQuery(query, recent)
      const semanticQuery = expanded === query ? query : `${query}\nRecent user context:\n${expanded.slice(0, -query.length)}`
      semanticMatches = (await semantic.search(boundedQuery(semanticQuery), null, AbortSignal.timeout(20000))).results
    } catch {
      warning = 'Semantic search was unavailable. This reply used keyword search only; relevant notes may be missing.'
    }
    const current = new Map(loadNotes().map((note) => [note.id, note]))
    const scores = new Map<string, number>()
    const texts = new Map(keywordNotes)
    // Reciprocal rank fusion: combine positions, not incompatible raw scores.
    for (const ranking of [[...keywordNotes.keys()], semanticMatches.map((match) => match.noteId)]) {
      ranking.forEach((id, index) => scores.set(id, (scores.get(id) ?? 0) + 1 / (60 + index + 1)))
    }
    for (const match of semanticMatches) {
      // The semantic snapshot can be newer than the keyword snapshot; never mix them.
      if (match.fingerprint !== hashes.get(match.noteId)) { scores.delete(match.noteId); continue }
      texts.set(match.noteId, [...new Set([...(texts.get(match.noteId) ?? []), ...match.passages])].slice(0, 3))
    }
    const matches = [...scores].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).flatMap(([id]) => {
      const note = current.get(id)
      if (!note || fingerprint(note) !== hashes.get(id)) return []
      // Organize needs complete originals for safe replacement. Ask can use passages.
      if (mode === 'organize' && noteText(note.content).length > 16000) return []
      return [{ note, passages: texts.get(id) ?? [] }]
    }).slice(0, mode === 'organize' ? 4 : 6)
    return { matches, ...(warning ? { warning } : {}) }
  }
}
