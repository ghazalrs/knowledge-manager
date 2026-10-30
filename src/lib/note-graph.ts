import type { GraphEdge, KnowledgeGraph } from '../types/graph.ts'

export const meaningfulConcept = (label: string) => !/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|yesterday|untitled|new topic|topic|introduction|conclusion|notes?|one day|week\s*\d+|\d+)$/i.test(label.trim())
export const notePair = (source: string, target: string) => JSON.stringify([source, target].sort())

// A shared idea is a reason to explore, not a claim that two notes agree.
export function noteGraph(raw: KnowledgeGraph, includeDismissed = false): KnowledgeGraph {
  const nodes = raw.nodes.filter((node) => node.kind === 'note')
  const valid = new Set(nodes.map((node) => node.id))
  const concepts = raw.nodes.filter((node) => node.kind === 'concept' && meaningfulConcept(node.label))
  const edges = new Map<string, GraphEdge>()
  for (const concept of concepts) {
    const mentions = raw.edges.filter((edge) => edge.kind === 'mentions' && edge.target === concept.id && valid.has(edge.source))
    for (let a = 0; a < mentions.length; a++) for (let b = a + 1; b < mentions.length; b++) {
      const [source, target] = [mentions[a].source, mentions[b].source].sort()
      if (source === target) continue
      const id = notePair(source, target)
      const edge = edges.get(id) ?? { id, source, target, kind: 'relationship', label: '', evidence: [], ideas: [] }
      if (!edge.ideas!.includes(concept.label)) edge.ideas!.push(concept.label)
      for (const item of [...mentions[a].evidence, ...mentions[b].evidence]) {
        if (!edge.evidence.some((other) => other.noteId === item.noteId && other.quote === item.quote)) edge.evidence.push(item)
      }
      edges.set(id, edge)
    }
  }
  for (const decision of raw.decisions ?? []) {
    if (!valid.has(decision.source) || !valid.has(decision.target)) continue
    const id = notePair(decision.source, decision.target)
    if (decision.action === 'dismiss') { if (!includeDismissed) edges.delete(id); continue }
    const edge = edges.get(id) ?? { id, source: decision.source, target: decision.target, kind: 'relationship', label: '', evidence: [], ideas: [] }
    edge.kept = true
    edges.set(id, edge)
  }
  for (const edge of edges.values()) {
    edge.ideas!.sort((a, b) => a.localeCompare(b))
    edge.label = edge.ideas!.length ? `Both discuss ${edge.ideas!.slice(0, 2).join(' · ')}${edge.ideas!.length > 2 ? ` +${edge.ideas!.length - 2}` : ''}` : 'You linked these notes'
  }
  return { ...raw, nodes, edges: [...edges.values()].sort((a, b) => Number(!!b.kept) - Number(!!a.kept) || (b.ideas?.length ?? 0) - (a.ideas?.length ?? 0) || a.id.localeCompare(b.id)) }
}
