import { useEffect, useState } from 'react'
import type { Note } from '@/types/note'
import { scheduleSemanticSearch, type SemanticSearchState } from '@/lib/home-search'

type State = SemanticSearchState & { query: string; folderId: string | null; notes: Note[]; attempt: number }

export function useHomeSearch(notes: Note[], query: string, folderId: string | null) {
  const term = query.trim()
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<State | null>(null)
  const enabled = !!term && notes.some((note) => folderId === null || note.folderId === folderId)
  useEffect(() => {
    if (!enabled) return
    return scheduleSemanticSearch(term, folderId, (result) => setState({ ...result, query: term, folderId, notes, attempt }))
  }, [term, folderId, notes, enabled, attempt])
  const current = enabled && state?.query === term && state.folderId === folderId && state.notes === notes && state.attempt === attempt ? state : null
  return {
    noteIds: current?.noteIds ?? [],
    pending: enabled && (!current || current.status === 'loading'),
    error: current?.error ?? '',
    retry: () => setAttempt((value) => value + 1),
  }
}
