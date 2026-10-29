import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createKnowledgeRetriever } from '../server/knowledge-retrieval.ts'
import { fingerprint, passages } from '../server/semantic-search.ts'
import { textDocument } from '../src/lib/note-text.ts'
import { generateKnowledgeReply } from '../server/openai.ts'
import type { Note } from '../src/types/note.ts'

const note = (id: string, title: string, text: string): Note => ({ id, title, content: textDocument(text), folderId: null, createdAt: 1 })
const sleep = note('sleep', 'Rest', 'Sleep improves recall.')
const memory = note('memory', 'Memory', 'Spaced repetition strengthens recall.')

test('hybrid retrieval merges exact and semantic matches, deduplicates, and expands only follow-ups', async () => {
  const queries: string[] = []
  const retrieve = createKnowledgeRetriever(() => [sleep, memory], { search: async (query) => {
    queries.push(query)
    return { results: [{ noteId: sleep.id, fingerprint: fingerprint(sleep), score: 0.8, excerpt: 'Sleep', passages: ['Sleep improves recall.'] }], refreshed: 0, searched: 2 }
  } })
  const first = await retrieve('Memory and feeling tired', [], 'ask')
  assert.deepEqual(new Set(first.matches.map(({ note }) => note.id)), new Set(['memory', 'sleep']))
  assert.equal(first.matches.length, 2)
  await retrieve('Tell me more about that', ['Memory and feeling tired'], 'ask')
  assert.match(queries[1], /Memory and feeling tired/)
  await retrieve('Instead, explain gardening', ['Memory and feeling tired'], 'ask')
  assert.equal(queries[2], 'Instead, explain gardening')
  assert.equal((await retrieve('Rest and sleep', [], 'ask')).matches.filter(({ note }) => note.id === 'sleep').length, 1)
  await retrieve('🧠'.repeat(2000), [], 'ask')
  assert.ok(Buffer.byteLength(queries.at(-1)!) <= 2000)
})

test('long notes expose relevant later passages to Ask but never incomplete replacement originals', async () => {
  const long = note('long', 'Long reading', `${'unrelated '.repeat(2000)}\nPhotosynthesis captures sunlight.`)
  const retrieve = createKnowledgeRetriever(() => [long], { search: async () => ({ results: [], refreshed: 0, searched: 1 }) })
  const result = await retrieve('photosynthesis sunlight', [], 'ask')
  assert.equal(result.matches[0].note.id, 'long')
  assert.ok(result.matches[0].passages.some((text) => text.includes('Photosynthesis')))
  assert.deepEqual((await retrieve('photosynthesis sunlight', [], 'organize')).matches, [])
})

test('semantic failure returns an explicit keyword-only warning, concurrent changes remove stale evidence', async () => {
  const retrieve = createKnowledgeRetriever(() => [memory], { search: async () => { throw new Error('private upstream error') } })
  const result = await retrieve('memory', [], 'ask')
  assert.equal(result.matches[0].note.id, 'memory')
  assert.match(result.warning!, /keyword search only/)
  assert.ok(!result.warning?.includes('private'))
  let current = [sleep]
  const racing = createKnowledgeRetriever(() => current, { search: async () => {
    current = [{ ...sleep, title: 'Changed' }]
    return { results: [{ noteId: sleep.id, fingerprint: fingerprint(sleep), score: 1, excerpt: 'Sleep', passages: ['Sleep'] }], refreshed: 0, searched: 1 }
  } })
  assert.deepEqual((await racing('sleep', [], 'ask')).matches, [])
})

test('grounded answers validate source IDs, support declarations, and use server-owned titles and passages', async () => {
  const matches = [sleep, memory].map((note) => ({ note, passages: passages(`${note.title}\n${note.content.content?.[0]?.content?.[0]?.text}`) }))
  const messages = [{ role: 'user' as const, content: 'How can I remember things?' }]
  let output: unknown = { content: 'Rest and spaced repetition can help.', support: 'supported', sourceIds: ['sleep', 'memory'] }
  const options = { apiKey: 'test', model: 'test', fetcher: (async (_url, init) => {
    const request = JSON.parse(init?.body as string)
    assert.equal(request.text.format.name, 'knowledge_answer')
    assert.match(request.instructions, /read-only/)
    assert.match(request.instructions, /general knowledge/)
    assert.equal(request.input.at(-1).content, messages[0].content)
    assert.match(request.input.at(-2).content, /Retrieved saved-note evidence/)
    return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output) }] }] })
  }) as typeof fetch }
  const answer = await generateKnowledgeReply(messages, options, { matches })
  assert.deepEqual(answer.knowledge.sources.map((source) => source.title), ['Rest', 'Memory'])
  assert.equal(answer.knowledge.sources[0].fingerprint, fingerprint(sleep))
  output = { content: 'Only part of the answer is supported by the note about rest.', support: 'partial', sourceIds: ['sleep'] }
  assert.equal((await generateKnowledgeReply(messages, options, { matches })).knowledge.support, 'partial')
  for (const invalid of [
    { content: 'Wrong source', support: 'supported', sourceIds: ['invented'] },
    { content: 'No citations', support: 'supported', sourceIds: [] },
    { content: 'Duplicate citations', support: 'supported', sourceIds: ['sleep', 'sleep'] },
    { content: 'Contradictory', support: 'none', sourceIds: ['sleep'] },
  ]) {
    output = invalid
    await assert.rejects(generateKnowledgeReply(messages, options, { matches }), /invalid source/)
  }
  output = { content: 'The notes do not answer this. General knowledge: try a different source.', support: 'none', sourceIds: [] }
  const missing = await generateKnowledgeReply(messages, options, { matches: [], warning: 'Search limited' })
  assert.equal(missing.knowledge.support, 'none')
  assert.deepEqual(missing.knowledge.sources, [])
  assert.equal(missing.knowledge.warning, 'Search limited')
})
