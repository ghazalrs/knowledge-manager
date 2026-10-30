import { useMemo, useState } from 'react'
import { Background, ControlButton, Controls, Handle, Position, ReactFlow,
  type NodeChange, type Node, type NodeProps, type ReactFlowInstance } from '@xyflow/react'
import { FileText, Focus, Sparkles } from 'lucide-react'
import type { KnowledgeGraph } from '@/types/graph'
import { graphNeighbors, neighborhoodPositions, type GraphViewport } from '@/lib/graph'

type NodeData = { label: string; kind: 'note' | 'concept'; focus: boolean }
const sides = { top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left }

function ExplorerNode({ data }: NodeProps<Node<NodeData>>) {
  const Icon = data.kind === 'note' ? FileText : Sparkles
  return <div className={`flex h-full flex-col justify-center rounded-2xl border px-4 shadow-sm transition-shadow hover:shadow-md ${data.focus
    ? 'border-sky-500 bg-sky-50 text-sky-950 dark:border-sky-600 dark:bg-sky-950 dark:text-sky-100'
    : data.kind === 'note' ? 'border-sky-200 bg-background text-foreground dark:border-sky-900'
      : 'border-teal-200 bg-teal-50/80 text-teal-950 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-100'}`}>
    {Object.entries(sides).map(([side, position]) => <span key={side}>
      <Handle type="source" id={`source-${side}`} position={position} className="pointer-events-none opacity-0" />
      <Handle type="target" id={`target-${side}`} position={position} className="pointer-events-none opacity-0" />
    </span>)}
    <span className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide opacity-60"><Icon className="size-3" />{data.focus ? 'Exploring' : data.kind}</span>
    <span className="line-clamp-2 break-words text-sm font-medium leading-5" title={data.label}>{data.label}</span>
  </div>
}

const nodeTypes = { explorer: ExplorerNode }
type Props = { graph: KnowledgeGraph; focusId: string; selectedEdge: string | null; compact: boolean; overview?: boolean; viewport?: GraphViewport
  onExplore: (id: string) => void; onSelectEdge: (id: string | null) => void; onViewport: (viewport: GraphViewport) => void }

export function GraphCanvas({ graph, focusId, selectedEdge, compact, overview, viewport, onExplore, onSelectEdge, onViewport }: Props) {
  const [moved, setMoved] = useState<Record<string, { x: number; y: number }>>({})
  const [flow, setFlow] = useState<ReactFlowInstance | null>(null)
  const nearby = useMemo(() => graphNeighbors(graph, focusId), [graph, focusId])
  const positions = useMemo(() => neighborhoodPositions(focusId, nearby, compact), [focusId, nearby, compact])
  if (overview) graph.nodes.forEach((node, index) => positions.set(node.id, { x: (index % (compact ? 2 : 4)) * 260, y: Math.floor(index / (compact ? 2 : 4)) * 150 }))
  const nodes: Node[] = graph.nodes.map((node) => ({
    id: node.id, type: 'explorer', position: moved[node.id] ?? positions.get(node.id)!,
    ariaLabel: `${node.kind}: ${node.label}${node.id === focusId ? ', current focus' : ', select to explore'}`,
    data: { label: node.label, kind: node.kind, focus: node.id === focusId },
    style: { width: node.id === focusId && !overview ? 224 : 184, height: node.id === focusId && !overview ? 96 : 80 },
  }))
  const edges = graph.edges.map((edge) => {
    const from = moved[edge.source] ?? positions.get(edge.source)!
    const to = moved[edge.target] ?? positions.get(edge.target)!
    const dx = to.x - from.x
    const dy = to.y - from.y
    const side = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'bottom' : 'top'
    const opposite = { right: 'left', left: 'right', bottom: 'top', top: 'bottom' }[side]
    return { id: edge.id, source: edge.source, target: edge.target, sourceHandle: `source-${side}`, targetHandle: `target-${opposite}`,
      label: edge.id === selectedEdge ? edge.label : undefined, ariaLabel: `${edge.label}. Select for sources.`, interactionWidth: 28,
      style: { stroke: edge.id === selectedEdge ? '#0284c7' : edge.kept ? '#64748b' : '#5eaaa0',
        strokeWidth: edge.id === selectedEdge ? 2.5 : 1.4, strokeDasharray: edge.kept ? undefined : '5 5' },
      labelStyle: { fill: 'var(--foreground)', fontSize: 12 }, labelBgStyle: { fill: 'var(--background)' },
    }
  })
  function move(changes: NodeChange[]) {
    for (const change of changes) if (change.type === 'position' && change.position) {
      const position = change.position
      setMoved((current) => ({ ...current, [change.id]: position }))
    }
  }
  return <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={move}
    fitView={overview || !viewport} fitViewOptions={{ padding: 0.15, minZoom: overview ? 0.05 : 0.55, maxZoom: 1 }} defaultViewport={viewport}
    minZoom={overview ? 0.05 : 0.3} maxZoom={2} onInit={setFlow} onMoveEnd={(_event, next) => onViewport(next)}
    nodesConnectable={false} deleteKeyCode={null} onPaneClick={() => onSelectEdge(null)}
    onNodeClick={(_event, node) => onExplore(node.id)} onEdgeClick={(_event, edge) => onSelectEdge(edge.id)}>
    <Background color="var(--border)" gap={28} size={1} />
    <Controls showInteractive={false} showFitView={false}>
      <ControlButton title="Fit this neighborhood" aria-label="Fit this neighborhood" onClick={() => { void flow?.fitView({ padding: 0.15, maxZoom: 1, duration: 250 }) }}><Focus /></ControlButton>
    </Controls>
  </ReactFlow>
}
