import type { GraphNode, KnowledgeGraph } from '../types/graph.ts'

export type GraphViewport = { x: number; y: number; zoom: number }
export type GraphLocation = { focusId: string | null; viewport?: GraphViewport; compact?: boolean }
export const graphLocationKey = 'knowledge-manager.graph-explorer.v1'

export function parseGraphLocation(raw: string | null): GraphLocation {
  try {
    const value: unknown = JSON.parse(raw ?? 'null')
    if (typeof value !== 'object' || value === null || !('focusId' in value) || typeof value.focusId !== 'string' || value.focusId.length > 256) return { focusId: null }
    const location: GraphLocation = { focusId: value.focusId, compact: 'compact' in value && value.compact === true }
    if ('viewport' in value && typeof value.viewport === 'object' && value.viewport !== null) {
      const viewport = value.viewport as Record<string, unknown>
      if (['x', 'y', 'zoom'].every((key) => typeof viewport[key] === 'number' && Number.isFinite(viewport[key]))
        && Math.abs(viewport.x as number) < 1000000 && Math.abs(viewport.y as number) < 1000000
        && (viewport.zoom as number) >= 0.1 && (viewport.zoom as number) <= 2) location.viewport = viewport as GraphViewport
    }
    return location
  } catch { return { focusId: null } }
}

export function graphNeighbors(graph: KnowledgeGraph, focusId: string): GraphNode[] {
  const ids = new Set<string>()
  for (const edge of graph.edges) {
    if (edge.source === focusId) ids.add(edge.target)
    if (edge.target === focusId) ids.add(edge.source)
  }
  ids.delete(focusId)
  const degree = new Map<string, number>()
  for (const edge of graph.edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1)
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1)
  }
  const rank = (id: string) => Math.max(0, ...graph.edges.filter((edge) => (edge.source === focusId && edge.target === id) || (edge.target === focusId && edge.source === id)).map((edge) => (edge.kept ? 1000 : 0) + (edge.ideas?.length ?? 0)))
  return graph.nodes.filter((node) => ids.has(node.id)).sort((a, b) =>
    rank(b.id) - rank(a.id) ||
    Number(a.kind !== 'note') - Number(b.kind !== 'note') || (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0)
    || a.label.localeCompare(b.label) || a.id.localeCompare(b.id))
}

export function initialGraphFocus(graph: KnowledgeGraph): string | null {
  const degree = new Map<string, number>()
  for (const edge of graph.edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1)
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1)
  }
  return [...graph.nodes].sort((a, b) => Number(a.kind !== 'note') - Number(b.kind !== 'note')
    || (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.label.localeCompare(b.label) || a.id.localeCompare(b.id))[0]?.id ?? null
}

export function graphNeighborhood(graph: KnowledgeGraph, focusId: string, pageSize = 6, requestedPage = 0) {
  const neighbors = graphNeighbors(graph, focusId)
  const pages = Math.max(1, Math.ceil(neighbors.length / pageSize))
  const page = Math.max(0, Math.min(pages - 1, requestedPage))
  const nearby = neighbors.slice(page * pageSize, (page + 1) * pageSize)
  const ids = new Set([focusId, ...nearby.map((node) => node.id)])
  const visible: KnowledgeGraph = { ...graph, nodes: graph.nodes.filter((node) => ids.has(node.id)),
    edges: graph.edges.filter((edge) => (edge.source === focusId || edge.target === focusId) && ids.has(edge.source) && ids.has(edge.target)) }
  return { graph: visible, nearby, total: neighbors.length, page, pages }
}

export function neighborhoodPositions(focusId: string, nearby: GraphNode[], compact: boolean): Map<string, { x: number; y: number }> {
  const positions = new Map([[focusId, { x: 0, y: 0 }]])
  nearby.forEach((node, index) => {
    if (compact) {
      positions.set(node.id, nearby.length === 1 ? { x: 20, y: 155 }
        : index === 2 ? { x: 20, y: 290 } : { x: index % 2 ? 150 : -110, y: 155 })
    } else {
      const angle = nearby.length === 1 ? 0 : -Math.PI / 2 + index * Math.PI * 2 / nearby.length
      positions.set(node.id, { x: 112 + Math.cos(angle) * 300 - 92, y: 48 + Math.sin(angle) * 190 - 40 })
    }
  })
  return positions
}

export function searchGraphNodes(graph: KnowledgeGraph, query: string): GraphNode[] {
  const term = query.normalize('NFKC').trim().toLowerCase()
  if (!term) return []
  const related = new Set(graph.edges.filter((edge) => [edge.label, ...(edge.ideas ?? [])].some((label) => label.normalize('NFKC').toLowerCase().includes(term))).flatMap((edge) => [edge.source, edge.target]))
  return graph.nodes.filter((node) => node.label.normalize('NFKC').toLowerCase().includes(term) || related.has(node.id))
    .sort((a, b) => Number(b.label.toLowerCase() === term) - Number(a.label.toLowerCase() === term)
      || Number(a.kind !== 'note') - Number(b.kind !== 'note') || a.label.localeCompare(b.label) || a.id.localeCompare(b.id))
}
