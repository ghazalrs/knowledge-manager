export type ExtractedConcept = { label: string; evidence: string }
export type ExtractedRelationship = { source: string; target: string; label: string; evidence: string }
export type NoteGraphExtraction = { concepts: ExtractedConcept[]; relationships: ExtractedRelationship[] }
export type GraphEvidence = { noteId: string; title: string; quote: string }
export type GraphNode = { id: string; kind: 'note' | 'concept'; label: string; noteId?: string }
export type GraphEdge = { id: string; source: string; target: string; kind: 'mentions' | 'relationship'; label: string; evidence: GraphEvidence[]; ideas?: string[]; kept?: boolean }
export type GraphDecision = { source: string; target: string; action: 'keep' | 'dismiss' }
export type KnowledgeGraph = {
  nodes: GraphNode[]; edges: GraphEdge[]
  progress: { completed: number; total: number; pending: number }
  decisions?: GraphDecision[]
}
