import assert from 'node:assert/strict'
import { test } from 'node:test'
import { refreshGraph } from '../src/lib/graph-api.ts'
import { graphNeighbors, graphNeighborhood, initialGraphFocus, neighborhoodPositions, parseGraphLocation, searchGraphNodes } from '../src/lib/graph.ts'
import type { KnowledgeGraph } from '../src/types/graph.ts'

const graph: KnowledgeGraph = {
  nodes: [{ id: 'n1', kind: 'note', label: 'Study', noteId: 'one' }, { id: 'c1', kind: 'concept', label: 'Sleep' }, { id: 'c2', kind: 'concept', label: 'Memory' }, { id: 'n2', kind: 'note', label: 'Cooking', noteId: 'two' }],
  edges: [{ id: 'e1', source: 'n1', target: 'c1', kind: 'mentions', label: 'mentions', evidence: [{ noteId: 'one', title: 'Study', quote: 'Sleep helps memory.' }] },
    { id: 'e2', source: 'c1', target: 'c2', kind: 'relationship', label: 'helps', evidence: [{ noteId: 'one', title: 'Study', quote: 'Sleep helps memory.' }] }],
  progress: { completed: 2, total: 2, pending: 0 },
}

test('focused neighborhoods show only direct connections and never draw links between neighboring nodes', () => {
  assert.deepEqual(graphNeighbors(graph, 'c1').map((node) => node.id), ['n1', 'c2'])
  const first = graphNeighborhood(graph, 'n1')
  assert.deepEqual(first.graph.nodes.map((node) => node.id), ['n1', 'c1'])
  assert.deepEqual(first.graph.edges.map((edge) => edge.id), ['e1'])
  const triangle = { ...graph, edges: [...graph.edges, { ...graph.edges[0], id: 'e3', target: 'c2' }] }
  assert.deepEqual(graphNeighborhood(triangle, 'n1').graph.edges.map((edge) => edge.id), ['e1', 'e3'])
  assert.deepEqual(graphNeighborhood(graph, 'deleted').graph.nodes, [])
})

test('neighbor pagination is bounded, deduplicated, deterministic, and reaches every connection', () => {
  const many: KnowledgeGraph = { ...graph, nodes: [graph.nodes[0], ...Array.from({ length: 9 }, (_, index) => ({ id: `c${index}`, kind: 'concept' as const, label: `Topic ${index}` }))],
    edges: Array.from({ length: 9 }, (_, index) => ({ ...graph.edges[0], id: `edge${index}`, target: `c${index}` })) }
  many.edges.push({ ...many.edges[0], id: 'duplicate-neighbor' })
  const first = graphNeighborhood(many, 'n1')
  const second = graphNeighborhood(many, 'n1', 6, 1)
  assert.equal(first.total, 9)
  assert.equal(first.nearby.length, 6)
  assert.equal(second.nearby.length, 3)
  assert.equal(new Set([...first.nearby, ...second.nearby].map((node) => node.id)).size, 9)
  assert.equal(graphNeighborhood(many, 'n1', 3).nearby.length, 3)
  assert.equal(graphNeighborhood(many, 'n1', 6, 999).page, 1)
  assert.deepEqual(first.nearby, graphNeighborhood({ ...many, nodes: [...many.nodes].reverse(), edges: [...many.edges].reverse() }, 'n1').nearby)
})

test('starting points prefer connected notes and search can jump to nodes or relationship endpoints', () => {
  assert.equal(initialGraphFocus(graph), 'n1')
  assert.equal(initialGraphFocus({ ...graph, nodes: [], edges: [] }), null)
  assert.deepEqual(searchGraphNodes(graph, ' sleep ').map((node) => node.id), ['c1'])
  assert.deepEqual(searchGraphNodes(graph, 'Ｓｌｅｅｐ').map((node) => node.id), ['c1'])
  assert.deepEqual(new Set(searchGraphNodes(graph, 'helps').map((node) => node.id)), new Set(['c1', 'c2']))
  assert.deepEqual(searchGraphNodes(graph, 'no-match'), [])
})

test('radial desktop and compact mobile neighborhoods place cards without overlap', () => {
  for (const compact of [false, true]) {
    const nearby = Array.from({ length: compact ? 3 : 6 }, (_, index) => ({ id: `neighbor${index}`, kind: 'concept' as const, label: `Topic ${index}` }))
    const positions = neighborhoodPositions('focus', nearby, compact)
    const entries = [...positions]
    assert.deepEqual(positions.get('focus'), { x: 0, y: 0 })
    for (let first = 0; first < entries.length; first++) for (let second = first + 1; second < entries.length; second++) {
      const [idA, a] = entries[first]
      const [idB, b] = entries[second]
      const widthA = idA === 'focus' ? 224 : 184
      const widthB = idB === 'focus' ? 224 : 184
      const heightA = idA === 'focus' ? 96 : 80
      const heightB = idB === 'focus' ? 96 : 80
      assert.ok(a.x + widthA <= b.x || b.x + widthB <= a.x || a.y + heightA <= b.y || b.y + heightB <= a.y)
    }
  }
})

test('saved graph locations validate viewport numbers without losing a valid focus', () => {
  assert.deepEqual(parseGraphLocation(JSON.stringify({ focusId: 'n1', viewport: { x: 10, y: -20, zoom: 0.8 }, compact: true })),
    { focusId: 'n1', viewport: { x: 10, y: -20, zoom: 0.8 }, compact: true })
  assert.deepEqual(parseGraphLocation('broken'), { focusId: null })
  assert.deepEqual(parseGraphLocation(null), { focusId: null })
  assert.deepEqual(parseGraphLocation('{"focusId":42}'), { focusId: null })
  assert.deepEqual(parseGraphLocation('{"focusId":"n1","viewport":{"x":0,"y":0,"zoom":0}}'), { focusId: 'n1', compact: false })
})

test('client refresh loads cached data first and processes one batch at a time until complete', async () => {
  const requests: string[] = []
  const updates: KnowledgeGraph[] = []
  await refreshGraph(new AbortController().signal, (value) => updates.push(value), async (url, init) => {
    requests.push(url as string)
    const completed = requests.length - 1
    if (completed) { assert.equal(init?.method, 'POST'); assert.equal(init?.body, '{}') }
    return Response.json({ ...graph, progress: { completed, total: 2, pending: 2 - completed } })
  })
  assert.deepEqual(requests, ['/api/graph', '/api/graph/refresh', '/api/graph/refresh'])
  assert.deepEqual(updates.map((value) => value.progress.completed), [0, 1, 2])
})

test('client cancellation stops further graph extraction and errors preserve already reported progress', async () => {
  const controller = new AbortController()
  let calls = 0
  await assert.rejects(refreshGraph(controller.signal, () => controller.abort(), async () => {
    calls++
    return Response.json({ ...graph, progress: { completed: 0, total: 1, pending: 1 } })
  }))
  assert.equal(calls, 1)
  const updates: KnowledgeGraph[] = []
  calls = 0
  await assert.rejects(refreshGraph(new AbortController().signal, (value) => updates.push(value), async () => {
    calls++
    return calls === 1 ? Response.json({ ...graph, progress: { completed: 1, total: 2, pending: 1 } })
      : Response.json({ error: 'Provider unavailable' }, { status: 502 })
  }), /Provider unavailable/)
  assert.equal(updates.length, 1)
  await assert.rejects(refreshGraph(new AbortController().signal, () => {}, async () => Response.json({ ...graph, edges: [{ source: 'unknown', target: 'c1' }] })), /could not be read/)
})
