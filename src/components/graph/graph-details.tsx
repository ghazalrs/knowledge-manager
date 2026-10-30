import { ArrowLeft } from 'lucide-react'
import type { GraphEdge, GraphNode, KnowledgeGraph } from '@/types/graph'
import { Button } from '@/components/ui/button'
import { graphNeighbors } from '@/lib/graph'

type Props = { graph: KnowledgeGraph; focus: GraphNode; edge?: GraphEdge; busy: boolean
  onSelectEdge: (id: string) => void; onClearEdge: () => void; onOpenNote: (id: string) => void; onExplore: (id: string) => void
  onDecide: (source: string, target: string, action: 'keep' | 'dismiss' | 'reset') => void; onIdea: (idea: string) => void }

export function GraphDetails({ graph, focus, edge, busy, onSelectEdge, onClearEdge, onOpenNote, onExplore, onDecide, onIdea }: Props) {
  const related = graphNeighbors(graph, focus.id)
  const sourceNodes = edge ? graph.nodes.filter((node) => node.id === edge.source || node.id === edge.target) : []
  const quotes = [...new Map((edge?.evidence ?? []).map((item) => [`${item.noteId}:${item.quote}`, item])).values()]
  return <aside aria-label="Graph details" className="shrink-0 space-y-4 rounded-2xl border border-border/60 bg-background p-4 text-sm lg:min-h-0 lg:w-72 lg:overflow-y-auto">
    {edge && <Button type="button" variant="ghost" size="xs" onClick={onClearEdge}><ArrowLeft />Back to note</Button>}
    <div><p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">{edge ? edge.kept ? 'Kept connection' : 'Suggested connection' : 'Exploring note'}</p>
      <h2 className="break-words font-medium">{edge ? edge.ideas?.length ? 'Shared ideas' : 'You linked these notes' : focus.label}</h2>
      {edge ? <div className="mt-2 flex flex-wrap gap-1">{edge.ideas?.map((idea) => <button key={idea} type="button" onClick={() => onIdea(idea)} className="rounded-md bg-muted px-2 py-1 text-xs hover:underline">{idea}</button>)}</div>
        : <p className="mt-1 text-xs text-muted-foreground">{related.length} related notes</p>}
    </div>
    {!edge && focus.noteId && <Button type="button" variant="outline" size="sm" onClick={() => onOpenNote(focus.noteId!)}>Open note</Button>}
    {edge ? <>
      <p className="text-xs leading-5 text-muted-foreground">{edge.ideas?.length ? 'These notes discuss the same ideas. They may have different perspectives.' : 'This connection was saved by you. No current shared-topic evidence is available.'}</p>
      <div className="space-y-2"><h3 className="text-xs font-medium">Sources</h3>{sourceNodes.map((node) => <button key={node.id} type="button" className="block text-left text-xs text-muted-foreground hover:underline" onClick={() => onOpenNote(node.noteId!)}>{node.label}</button>)}</div>
      <div className="flex flex-wrap gap-2"><Button disabled={busy} size="sm" variant="outline" onClick={() => onDecide(edge.source, edge.target, edge.kept ? 'reset' : 'keep')}>{edge.kept ? 'Unkeep' : 'Keep connection'}</Button>
        <Button disabled={busy} size="sm" variant="ghost" onClick={() => onDecide(edge.source, edge.target, 'dismiss')}>Dismiss</Button></div>
      {quotes.length > 0 && <details key={edge.id} className="border-t border-border pt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">Evidence</summary><div className="mt-3 max-h-56 space-y-3 overflow-y-auto">{quotes.map((item) => <blockquote key={`${item.noteId}:${item.quote}`} className="break-words border-l-2 border-border pl-3 leading-5"><p className="mb-1 font-medium">{item.title}</p>{item.quote}</blockquote>)}</div></details>}
    </> : <>
      <div className="space-y-3"><h3 className="text-xs font-medium">Why explore next?</h3>{related.length ? related.slice(0, 6).map((node) => {
        const connection = graph.edges.find((item) => (item.source === focus.id && item.target === node.id) || (item.target === focus.id && item.source === node.id))!
        return <div key={node.id}><button type="button" onClick={() => onExplore(node.id)} className="text-left text-xs font-medium hover:underline">{node.label}</button><button type="button" onClick={() => onSelectEdge(connection.id)} className="mt-1 block text-left text-xs leading-5 text-muted-foreground hover:underline">{connection.label} · Why?</button></div>
      }) : <p className="text-xs text-muted-foreground">No related notes yet. Link a note below or add more notes about this subject.</p>}</div>
      <label className="block text-xs text-muted-foreground">Link a note<select aria-label="Link a note" value="" disabled={busy} className="mt-2 w-full rounded-lg border border-border bg-background p-2 text-xs" onChange={(event) => { if (event.target.value) onDecide(focus.id, event.target.value, 'keep') }}><option value="">Choose a note…</option>{graph.nodes.filter((node) => node.id !== focus.id).map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}</select></label>
    </>}
  </aside>
}
