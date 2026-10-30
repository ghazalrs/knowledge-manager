import { useEffect, useId, useState } from 'react'
import { ArrowLeft, ArrowRight, ChevronRight, FileText, LoaderCircle, Network, RefreshCw, Search, Sparkles } from 'lucide-react'
import { noteGraph } from '@/lib/note-graph'
import type { Note } from '@/types/note'
import { Button } from '@/components/ui/button'
import { useKnowledgeGraph } from '@/hooks/use-knowledge-graph'
import { graphLocationKey, graphNeighborhood, graphNeighbors, initialGraphFocus, parseGraphLocation, searchGraphNodes, type GraphViewport } from '@/lib/graph'
import { GraphCanvas } from './graph-canvas'
import { GraphDetails } from './graph-details'

type Props = { notes: Note[]; ready: boolean; onOpenNote: (id: string) => void }
type Navigation = { trail: string[]; viewports: Record<string, GraphViewport> }

function initialNavigation(): Navigation {
  try {
    const location = parseGraphLocation(localStorage.getItem(graphLocationKey))
    return { trail: location.focusId ? [location.focusId] : [], viewports: location.focusId && location.viewport
      ? { [`${location.focusId}:${location.compact ? 'small' : 'wide'}`]: location.viewport } : {} }
  } catch { return { trail: [], viewports: {} } }
}

export default function KnowledgeGraphView({ notes, ready, onOpenNote }: Props) {
  const { graph: rawGraph, error, refreshing, retry, saveConnection } = useKnowledgeGraph(notes, ready)
  const graph = rawGraph ? noteGraph(rawGraph) : null
  const [overview, setOverview] = useState(false)
  const [idea, setIdea] = useState('')
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [showDismissed, setShowDismissed] = useState(false)
  const [query, setQuery] = useState('')
  const [navigation, setNavigation] = useState(initialNavigation)
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null)
  const [pageState, setPageState] = useState({ focusId: '', page: 0 })
  const [browsing, setBrowsing] = useState(false)
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 767px)').matches)
  const searchId = useId()
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const update = () => setCompact(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  const trail = navigation.trail.filter((id) => graph?.nodes.some((node) => node.id === id))
  const focusId = trail.at(-1) ?? (graph ? initialGraphFocus(graph) : null)
  const focus = graph?.nodes.find((node) => node.id === focusId)
  const frame = `${focusId}:${compact ? 'small' : 'wide'}`
  const viewport = navigation.viewports[frame]
  const neighborhood = graph && focusId ? graphNeighborhood(graph, focusId, compact ? 3 : 6, pageState.focusId === focusId ? pageState.page : 0) : null
  const results = graph ? searchGraphNodes(graph, query) : []
  const ideaNotes = rawGraph && idea ? rawGraph.edges.filter((item) => item.kind === 'mentions' && rawGraph.nodes.some((node) => node.id === item.target && node.label === idea)).map((item) => item.source) : []
  const displayedGraph = overview && graph ? { ...graph, ...(idea ? { nodes: graph.nodes.filter((node) => ideaNotes.includes(node.id)), edges: graph.edges.filter((item) => ideaNotes.includes(item.source) && ideaNotes.includes(item.target)) } : {}) } : neighborhood?.graph
  const edge = graph?.edges.find((item) => item.id === selectedEdge && (overview || item.source === focusId || item.target === focusId))
  useEffect(() => {
    if (!focusId) return
    try { localStorage.setItem(graphLocationKey, JSON.stringify({ focusId, viewport, compact })) } catch { /* Browsing still works without browser storage. */ }
  }, [focusId, viewport, compact])

  function explore(id: string) {
    if (!graph?.nodes.some((node) => node.id === id)) return
    setSelectedEdge(null)
    setOverview(false)
    setIdea('')
    setQuery('')
    setBrowsing(false)
    setPageState({ focusId: id, page: 0 })
    if (id === focusId) return
    const history = trail.length ? trail : focusId ? [focusId] : []
    setNavigation((current) => ({ ...current, trail: [...history, id].slice(-24) }))
  }
  function backTo(index: number) {
    setNavigation((current) => ({ ...current, trail: trail.slice(0, index + 1) }))
    setSelectedEdge(null)
    setQuery('')
    setBrowsing(false)
    setPageState({ focusId: '', page: 0 })
  }
  function rememberViewport(next: GraphViewport) {
    setNavigation((current) => ({ ...current, viewports: Object.fromEntries([...Object.entries(current.viewports).filter(([key]) => key !== frame), [frame, next]].slice(-24)) }))
  }
  async function decide(source: string, target: string, action: 'keep' | 'dismiss' | 'reset') {
    setBusy(true); setSaveError('')
    try { await saveConnection(source, target, action); if (action === 'dismiss') setSelectedEdge(null) }
    catch (error) { setSaveError(error instanceof Error ? error.message : 'Could not save connection.') }
    finally { setBusy(false) }
  }
  function exploreIdea(value: string) { if (value) { setIdea(value); setOverview(true); setSelectedEdge(null) } }
  return <section aria-label="Knowledge graph" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4 sm:px-6">
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-xl font-medium tracking-tight">Knowledge graph</h1><p className="mt-1 text-xs text-muted-foreground">Discover related notes and see why they connect.</p></div>
      <div className="flex flex-wrap gap-1"><Button type="button" variant="ghost" size="sm" onClick={() => { setOverview((value) => !value); setIdea(''); setBrowsing(false) }}>{overview ? 'Focused view' : 'Overview'}</Button><Button type="button" variant="ghost" size="sm" onClick={() => setBrowsing((value) => !value)}>{browsing ? 'Return to graph' : 'Browse notes'}</Button>
        <Button type="button" variant="ghost" size="icon" aria-label={error ? 'Retry graph extraction' : 'Refresh graph'} onClick={retry} disabled={!ready || refreshing}><RefreshCw className="size-4" /></Button></div>
    </div>
    <div className="relative shrink-0">
      <div className="flex items-center gap-2 rounded-xl bg-muted px-3"><Search aria-hidden="true" className="size-4 text-muted-foreground" /><label htmlFor={searchId} className="sr-only">Find a note or shared idea</label>
        <input id={searchId} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a note or shared idea…"
          onKeyDown={(event) => { if (event.key === 'Escape') setQuery(''); if (event.key === 'Enter' && results[0]) explore(results[0].id) }}
          className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none" />
      </div>
      {query.trim() && <div className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-border bg-background p-2">
        {!results.length ? <p className="p-2 text-xs text-muted-foreground">No matching notes.</p> : <ul aria-label="Matching notes" className="space-y-1">{results.slice(0, 12).map((node) => {
          const Icon = node.kind === 'note' ? FileText : Sparkles
          return <li key={node.id}><button type="button" onClick={() => explore(node.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted"><Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{node.label}</span><span className="text-[10px] text-muted-foreground">{node.kind}</span></button></li>
        })}</ul>}
        {results.length > 12 && <p className="px-2 py-1 text-xs text-muted-foreground">Showing 12 of {results.length}. Refine your search for more.</p>}
      </div>}
    </div>
    {graph && <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><p>{graph.nodes.length} notes · {graph.edges.length} connections</p><span>Solid: kept by you · Dashed: AI suggestion</span></div>}
    <p className="shrink-0 text-xs text-muted-foreground">Every card is a note. Click a card to explore; select a line to see why the notes connect.</p>
    {saveError && <p role="alert" className="text-xs text-destructive">{saveError}</p>}
    {!!rawGraph?.decisions?.some((item) => item.action === 'dismiss') && <details open={showDismissed} onToggle={(event) => setShowDismissed(event.currentTarget.open)} className="shrink-0 text-xs text-muted-foreground"><summary className="cursor-pointer">Dismissed connections</summary><div className="mt-2 space-y-2">{rawGraph.decisions.filter((item) => item.action === 'dismiss' && graph?.nodes.some((node) => node.id === item.source) && graph.nodes.some((node) => node.id === item.target)).map((item) => <div key={`${item.source}:${item.target}`} className="flex items-center gap-2"><span>{graph?.nodes.find((node) => node.id === item.source)?.label} ↔ {graph?.nodes.find((node) => node.id === item.target)?.label}</span><Button size="xs" variant="outline" disabled={busy} onClick={() => void decide(item.source, item.target, 'reset')}>Restore</Button></div>)}</div></details>}
    {overview && <p className="shrink-0 text-sm font-medium">{idea ? `Notes discussing ${idea}` : 'All notes'} <span className="text-xs font-normal text-muted-foreground">— select a note to start a trail</span></p>}
    {!ready && <p role="status" className="text-xs text-muted-foreground">Waiting for saved notes…</p>}
    {refreshing && <p role="status" className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground"><LoaderCircle aria-hidden="true" className="size-3 motion-safe:animate-spin" />{graph ? `Updating connections · ${graph.progress.completed}/${graph.progress.total}` : 'Loading graph…'}</p>}
    {error && <p role="alert" className="shrink-0 rounded-xl bg-muted p-3 text-xs text-destructive">{error} Completed connections are preserved.</p>}
    {browsing && graph ? <div className="min-h-0 flex-1 overflow-y-auto"><h2 className="mb-3 text-sm font-medium">Choose a starting note</h2><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{graph.nodes.filter((node) => node.kind === 'note').map((node) => <button key={node.id} type="button" onClick={() => explore(node.id)} className="rounded-2xl border border-border p-4 text-left hover:bg-muted"><FileText aria-hidden="true" className="mb-2 size-4 text-sky-600" /><span className="block text-sm font-medium">{node.label}</span><span className="mt-1 block text-xs text-muted-foreground">{graphNeighbors(graph, node.id).length} connections</span></button>)}</div></div>
      : focus && graph && neighborhood ? <>
        <nav aria-label="Exploration path" className="flex shrink-0 items-center gap-1 overflow-x-auto text-xs">
          <Button type="button" variant="ghost" size="sm" aria-label="Go back in graph" disabled={trail.length < 2} onClick={() => backTo(trail.length - 2)}><ArrowLeft className="size-4" />Back</Button>
          {(trail.length ? trail : [focus.id]).slice(-3).map((id, index, shown) => <span key={`${id}-${index}`} className="flex min-w-0 items-center gap-1"><button type="button" className="max-w-28 truncate text-muted-foreground hover:text-foreground sm:max-w-44" aria-current={index === shown.length - 1 ? 'location' : undefined} onClick={() => backTo(Math.max(0, trail.length - shown.length + index))}>{graph.nodes.find((node) => node.id === id)?.label}</button>{index < shown.length - 1 && <ChevronRight className="size-3 shrink-0 text-muted-foreground" />}</span>)}
        </nav>
        <div className="flex flex-none flex-col gap-3 lg:min-h-0 lg:flex-1 lg:flex-row">
          <div className="flex min-w-0 flex-col gap-2 lg:min-h-0 lg:flex-1">
            <div className="relative h-[55svh] min-h-80 overflow-hidden rounded-2xl border border-border bg-muted/20 lg:h-auto lg:min-h-96 lg:flex-1">
              <GraphCanvas key={`${frame}:${neighborhood.page}:${overview}:${idea}`} graph={displayedGraph ?? neighborhood.graph} overview={overview} focusId={focus.id} compact={compact} selectedEdge={edge?.id ?? null} viewport={overview ? undefined : viewport}
                onExplore={explore} onSelectEdge={setSelectedEdge} onViewport={overview ? () => {} : rememberViewport} />
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><p>{overview ? `${displayedGraph?.nodes.length ?? 0} notes shown` : neighborhood.total ? `Showing ${neighborhood.page * (compact ? 3 : 6) + 1}–${neighborhood.page * (compact ? 3 : 6) + neighborhood.nearby.length} of ${neighborhood.total} connections` : refreshing ? 'Finding connections for this note…' : 'No connections yet. Try another note.'}</p>
              {!overview && neighborhood.pages > 1 && <div className="flex gap-1"><Button type="button" variant="ghost" size="icon" aria-label="Previous connections" disabled={!neighborhood.page} onClick={() => { setPageState({ focusId: focus.id, page: neighborhood.page - 1 }); setSelectedEdge(null) }}><ArrowLeft /></Button><Button type="button" variant="ghost" size="sm" aria-label="Next connections" disabled={neighborhood.page >= neighborhood.pages - 1} onClick={() => { setPageState({ focusId: focus.id, page: neighborhood.page + 1 }); setSelectedEdge(null) }}>More<ArrowRight /></Button></div>}
            </div>
          </div>
          {overview && !edge ? <aside className="shrink-0 space-y-3 rounded-2xl border border-border/60 p-4 text-sm lg:w-72"><h2 className="font-medium">{idea ? `Shared idea: ${idea}` : 'Your note collection'}</h2><p className="text-xs leading-5 text-muted-foreground">Choose a note to explore its connections. Select a line to see the shared ideas and source notes.</p></aside> : <GraphDetails graph={graph} focus={focus} edge={edge} busy={busy} onSelectEdge={setSelectedEdge} onExplore={explore} onDecide={(a, b, action) => void decide(a, b, action)} onIdea={exploreIdea} onClearEdge={() => setSelectedEdge(null)} onOpenNote={onOpenNote} />}
        </div>
      </> : <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground"><Network aria-hidden="true" className="size-8" /><p>{graph ? 'Create a note to start exploring.' : 'Your graph will appear here.'}</p></div>}
    <p className="shrink-0 text-[11px] text-muted-foreground">New or changed note text is sent to OpenAI to update connections. Cached connections are reused; API charges apply.</p>
  </section>
}
