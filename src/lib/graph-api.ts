import type { KnowledgeGraph } from '../types/graph.ts'

function validGraph(value: unknown): value is KnowledgeGraph {
  if (typeof value !== 'object' || value === null || !('nodes' in value) || !Array.isArray(value.nodes)
    || !('edges' in value) || !Array.isArray(value.edges) || !('progress' in value)
    || typeof value.progress !== 'object' || value.progress === null) return false
  const nodeIds = new Set<string>()
  for (const node of value.nodes) {
    if (typeof node !== 'object' || node === null || typeof node.id !== 'string' || !node.id || typeof node.label !== 'string'
      || !['note', 'concept'].includes(node.kind) || (node.kind === 'note' && typeof node.noteId !== 'string') || nodeIds.has(node.id)) return false
    nodeIds.add(node.id)
  }
  const edgeIds = new Set<string>()
  for (const edge of value.edges) {
    if (typeof edge !== 'object' || edge === null || typeof edge.id !== 'string' || edgeIds.has(edge.id)
      || !nodeIds.has(edge.source) || !nodeIds.has(edge.target) || typeof edge.label !== 'string'
      || !['mentions', 'relationship'].includes(edge.kind) || !Array.isArray(edge.evidence)
      || edge.evidence.some((item: unknown) => typeof item !== 'object' || item === null || !('noteId' in item) || typeof item.noteId !== 'string'
        || !('title' in item) || typeof item.title !== 'string' || !('quote' in item) || typeof item.quote !== 'string')) return false
    edgeIds.add(edge.id)
  }
  const progress = value.progress as Record<string, unknown>
  if ('decisions' in value && (!Array.isArray(value.decisions) || value.decisions.some((item: unknown) =>
    typeof item !== 'object' || item === null || !('source' in item) || !nodeIds.has(item.source as string)
    || !('target' in item) || !nodeIds.has(item.target as string) || item.source === item.target
    || !('action' in item) || !['keep', 'dismiss'].includes(item.action as string)))) return false
  return ['completed', 'total', 'pending'].every((key) => typeof progress[key] === 'number' && Number.isSafeInteger(progress[key]) && (progress[key] as number) >= 0)
    && progress.total === (progress.completed as number) + (progress.pending as number)
}

export async function saveGraphConnection(source: string, target: string, action: 'keep' | 'dismiss' | 'reset') {
  const response = await fetch('/api/graph/connections', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, target, action }), signal: AbortSignal.timeout(10000) })
  const body: unknown = await response.json()
  if (!response.ok) throw new Error(typeof body === 'object' && body && 'error' in body && typeof body.error === 'string' ? body.error : 'Could not save connection.')
  if (!validGraph(body)) throw new Error('Could not read saved connections. Refresh and retry.')
  return body
}

export async function refreshGraph(signal: AbortSignal, update: (graph: KnowledgeGraph) => void, fetcher: typeof fetch = fetch) {
  async function request(refresh: boolean) {
    signal.throwIfAborted()
    const response = await fetcher(refresh ? '/api/graph/refresh' : '/api/graph', {
      method: refresh ? 'POST' : 'GET', cache: 'no-store',
      ...(refresh ? { headers: { 'Content-Type': 'application/json' }, body: '{}' } : {}),
      signal: AbortSignal.any([signal, AbortSignal.timeout(70000)]),
    })
    const body: unknown = await response.json()
    signal.throwIfAborted()
    if (!response.ok) throw new Error(typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string' ? body.error : 'Could not load the knowledge graph. Please retry.')
    if (!validGraph(body)) throw new Error('The knowledge graph response could not be read. Please retry.')
    return body
  }
  let graph = await request(false)
  update(graph)
  while (graph.progress.pending > 0) {
    graph = await request(true)
    update(graph)
  }
}
