import { useEffect, useState } from 'react'
import type { Note } from '@/types/note'
import type { KnowledgeGraph } from '@/types/graph'
import { refreshGraph, saveGraphConnection } from '@/lib/graph-api'

type State = { notes: Note[]; attempt: number; graph: KnowledgeGraph | null; error: string }

export function useKnowledgeGraph(notes: Note[], ready: boolean) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<State | null>(null)
  const [decisions, setDecisions] = useState<KnowledgeGraph['decisions']>(undefined)
  useEffect(() => {
    if (!ready) return
    const controller = new AbortController()
    void refreshGraph(controller.signal, (graph) => setState({ notes, attempt, graph, error: '' }))
      .catch((error) => {
        if (!controller.signal.aborted) setState((current) => ({
          notes, attempt, graph: current?.notes === notes ? current.graph : null,
          error: error instanceof Error ? error.message : 'Could not load the knowledge graph.',
        }))
      })
    return () => { controller.abort() }
  }, [notes, ready, attempt])
  const current = ready && state?.notes === notes && state.attempt === attempt ? state : null
  return { graph: current?.graph ? { ...current.graph, ...(decisions ? { decisions } : {}) } : null, error: current?.error ?? '', refreshing: ready && (!current || (!current.error && !!current.graph?.progress.pending)),
    saveConnection: async (source: string, target: string, action: 'keep' | 'dismiss' | 'reset') => {
      const graph = await saveGraphConnection(source, target, action)
      setDecisions(graph.decisions ?? [])
    },
    retry: () => { setDecisions(undefined); setAttempt((value) => value + 1) } }
}
