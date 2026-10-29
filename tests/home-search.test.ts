import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setTimeout as pause } from 'node:timers/promises'
import { scheduleSemanticSearch, type SemanticSearchState } from '../src/lib/home-search.ts'

test('clearing a search before its debounce expires prevents requests and updates', async () => {
  let calls = 0
  const updates: SemanticSearchState[] = []
  const cancel = scheduleSemanticSearch('sleep', null, (state) => updates.push(state), {
    delay: 0, fetcher: async () => { calls++; return Response.json({ results: [] }) },
  })
  cancel()
  await pause(10)
  assert.equal(calls, 0)
  assert.deepEqual(updates, [])
})

test('Home search sends the query and folder, then reports ranked semantic IDs', async () => {
  const updates: SemanticSearchState[] = []
  let done: () => void = () => {}
  const finished = new Promise<void>((resolve) => { done = resolve })
  const cancel = scheduleSemanticSearch('feeling tired', 'health', (state) => {
    updates.push(state)
    if (state.status !== 'loading') done()
  }, { delay: 0, fetcher: async (url, init) => {
    assert.equal(url, '/api/search/semantic')
    assert.deepEqual(JSON.parse(init?.body as string), { query: 'feeling tired', folderId: 'health' })
    assert.equal(init?.method, 'POST')
    return Response.json({ results: [{ noteId: 'rest' }, { noteId: 'recovery' }] })
  } })
  await finished
  cancel()
  assert.deepEqual(updates.map((state) => state.status), ['loading', 'done'])
  assert.deepEqual(updates[1].noteIds, ['rest', 'recovery'])
})

test('changing a query aborts its request and ignores even a late response from an uncooperative provider', async () => {
  let started: () => void = () => {}
  const ready = new Promise<void>((resolve) => { started = resolve })
  let finish: (response: Response) => void = () => {}
  const response = new Promise<Response>((resolve) => { finish = resolve })
  const updates: SemanticSearchState[] = []
  let signal: AbortSignal | undefined
  const cancel = scheduleSemanticSearch('old query', null, (state) => updates.push(state), {
    delay: 0, fetcher: async (_url, init) => { signal = init?.signal ?? undefined; started(); return response },
  })
  await ready
  cancel()
  assert.equal(signal?.aborted, true)
  finish(Response.json({ results: [{ noteId: 'outdated' }] }))
  await pause(0)
  assert.deepEqual(updates.map((state) => state.status), ['loading'])
})

test('provider failures, malformed results, and oversized Unicode queries preserve a retryable text-only state', async () => {
  for (const scenario of ['offline', 'rejected', 'malformed', 'long']) {
    let done: (state: SemanticSearchState) => void = () => {}
    const finished = new Promise<SemanticSearchState>((resolve) => { done = resolve })
    let calls = 0
    const cancel = scheduleSemanticSearch(scenario === 'long' ? '🧠'.repeat(501) : 'query', null, (state) => {
      if (state.status !== 'loading') done(state)
    }, { delay: 0, fetcher: async () => {
      calls++
      if (scenario === 'offline') throw new Error('Offline')
      if (scenario === 'rejected') return Response.json({ error: 'Set OPENAI_API_KEY to enable related notes.' }, { status: 503 })
      return Response.json({ results: [{ noteId: 42 }] })
    } })
    const state = await finished
    cancel()
    assert.equal(state.status, 'error')
    assert.deepEqual(state.noteIds, [])
    assert.ok(state.error.length > 0)
    assert.equal(calls, scenario === 'long' ? 0 : 1)
  }
})
