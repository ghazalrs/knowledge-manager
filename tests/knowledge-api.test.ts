import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NotesStore } from '../server/notes-store.ts'
import { ChatStore } from '../server/chat-store.ts'
import { SemanticSearch } from '../server/semantic-search.ts'
import { createKnowledgeRetriever } from '../server/knowledge-retrieval.ts'
import { createChatApi } from '../server/chat-api.ts'
import { textDocument } from '../src/lib/note-text.ts'
import type { StoredChatMessage } from '../src/types/chat.ts'

type ProviderRequest = { instructions: string; text: { format: { name: string } }; input: { role: string; content: string }[] }

async function fixture(run: (context: {
  notes: NotesStore; chats: ChatStore; path: string; url: string
  send: (id: string, content: string, mode?: 'ask' | 'organize') => Promise<Response>
  control: { failEmbeddings: boolean; embeddingCalls: number; requests: ProviderRequest[]; respond?: (request: ProviderRequest) => unknown }
}) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'knowledge-api-'))
  const path = join(directory, 'test.sqlite')
  const notes = new NotesStore(path)
  const chats = new ChatStore(path)
  const control = { failEmbeddings: false, embeddingCalls: 0, requests: [] as ProviderRequest[], respond: undefined as ((request: ProviderRequest) => unknown) | undefined }
  const semantic = new SemanticSearch(path, () => notes.loadNotes(), async (inputs) => {
    control.embeddingCalls++
    if (control.failEmbeddings) throw new Error('Provider failed with private information')
    return inputs.map((text) => /sleep|rest|fatigue|tired/i.test(text) ? [1, 0, 0] : /recall|memory|repetition/i.test(text) ? [0, 1, 0] : [0, 0, 1])
  })
  const api = createChatApi({ apiKey: 'test', model: 'test',
    retrieve: createKnowledgeRetriever(() => notes.loadNotes(), semantic),
    titleGenerator: async () => 'Knowledge chat',
    fetcher: async (_url, init) => {
      const request = JSON.parse(init?.body as string) as ProviderRequest
      control.requests.push(request)
      const evidence = request.input.find((item) => item.content.startsWith('Retrieved saved-note evidence'))
      const matches: { noteId: string }[] = evidence ? JSON.parse(evidence.content.split('\n').slice(1).join('\n')) : []
      const data = control.respond ? control.respond(request) : {
        content: matches.length ? 'The retrieved notes support these study strategies.' : 'The saved notes do not answer this question. General knowledge: seek further information.',
        support: matches.length ? 'supported' : 'none', sourceIds: matches.map((match) => match.noteId),
      }
      return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(data) }] }] })
    },
  }, chats)
  const server = createServer(api)
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Missing address')
    const url = `http://127.0.0.1:${address.port}/api/chat`
    const send = (id: string, content: string, mode: 'ask' | 'organize' = 'ask') => fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, content, mode }),
    })
    await run({ notes, chats, path, url, send, control })
  } finally {
    await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections() })
    semantic.close(); chats.close(); notes.close(); await rm(directory, { recursive: true })
  }
}

const addNote = (notes: NotesStore, id: string, title: string, text: string) => notes.createNote({ id, title, content: textDocument(text), folderId: null, createdAt: 1 })

test('Ask combines multiple notes, persists sources, retries without calls, and never changes notes or folders', async () => {
  await fixture(async ({ notes, chats, path, send, control }) => {
    addNote(notes, 'sleep', 'Rest', 'Sleep restores attention.')
    addNote(notes, 'memory', 'Memory techniques', 'Spaced repetition improves recall.')
    const original = notes.loadNotes()
    const response = await send('question', 'How do memory techniques help with fatigue?')
    assert.equal(response.status, 200)
    const answer = await response.json() as StoredChatMessage
    assert.equal(answer.knowledge?.support, 'supported')
    assert.deepEqual(new Set(answer.knowledge?.sources.map((source) => source.noteId)), new Set(['sleep', 'memory']))
    assert.ok(answer.knowledge?.sources.every((source) => source.state === 'current'))
    assert.deepEqual(notes.loadNotes(), original)
    assert.deepEqual(notes.loadFolders(), [])
    assert.ok(chats.loadMessages().every((message) => !message.proposal))
    const calls = control.requests.length
    assert.equal((await send('question', 'How do memory techniques help with fatigue?')).status, 200)
    assert.equal(control.requests.length, calls)
    const reopened = new ChatStore(path)
    try { assert.deepEqual(reopened.findReply('question')?.knowledge, answer.knowledge) } finally { reopened.close() }
    notes.updateNote('sleep', { title: 'Rest changed' })
    notes.deleteNote('memory')
    const historical = chats.findReply('question')!.knowledge!
    assert.equal(historical.sources.find((source) => source.noteId === 'sleep')?.state, 'changed')
    assert.equal(historical.sources.find((source) => source.noteId === 'memory')?.state, 'deleted')
    assert.equal(historical.sources.find((source) => source.noteId === 'sleep')?.title, 'Rest')
    assert.match(historical.sources.find((source) => source.noteId === 'memory')!.excerpt, /repetition/)
  })
})

test('empty and unrelated evidence is explicit; keyword fallback is visible and private errors do not leak', async () => {
  await fixture(async ({ notes, send, control }) => {
    const empty = await (await send('empty', 'What do my notes say about sleep?')).json() as StoredChatMessage
    assert.equal(empty.knowledge?.support, 'none')
    assert.deepEqual(empty.knowledge?.sources, [])
    assert.equal(control.embeddingCalls, 0)
    addNote(notes, 'memory', 'Memory', 'Spaced repetition improves recall.')
    const unrelated = await (await send('unrelated', 'Garden planting')).json() as StoredChatMessage
    assert.equal(unrelated.knowledge?.support, 'none')
    control.failEmbeddings = true
    const fallback = await (await send('fallback', 'memory')).json() as StoredChatMessage
    assert.equal(fallback.knowledge?.support, 'supported')
    assert.match(fallback.knowledge!.warning!, /keyword search only/)
    assert.ok(!JSON.stringify(fallback).includes('private information'))
  })
})

test('invalid source output and edits during generation leave retryable messages without saved answers', async () => {
  await fixture(async ({ notes, chats, send, control }) => {
    addNote(notes, 'sleep', 'Rest', 'Sleep restores attention.')
    control.respond = () => ({ content: 'Invented', support: 'supported', sourceIds: ['invented'] })
    assert.equal((await send('invalid', 'fatigue')).status, 502)
    assert.equal(chats.findReply('invalid'), undefined)
    control.respond = () => {
      notes.updateNote('sleep', { title: 'Updated while answering' })
      return { content: 'Sleep helps.', support: 'supported', sourceIds: ['sleep'] }
    }
    assert.equal((await send('race', 'fatigue')).status, 409)
    assert.equal(chats.findReply('race'), undefined)
    control.respond = undefined
    assert.equal((await send('race', 'fatigue')).status, 200)
    assert.equal(chats.findReply('race')?.knowledge?.sources[0].title, 'Updated while answering')
    assert.equal(chats.loadMessages().filter((message) => message.id === 'race').length, 1)
  })
})

test('Organize uses semantic-only matches while approval, stale checks, and exact undo remain intact', async () => {
  await fixture(async ({ notes, chats, send, url, control }) => {
    addNote(notes, 'sleep', 'Rest', 'Sleep restores attention.')
    const original = notes.loadNotes()[0]
    control.respond = (request) => {
      assert.equal(request.text.format.name, 'note_proposal')
      const evidence = request.input.find((item) => item.content.startsWith('Related saved notes'))
      assert.ok(evidence?.content.includes('Sleep restores attention.'))
      return { action: 'update', targetNoteId: 'sleep', title: 'Rest and recovery', content: 'Sleep restores attention. Consistency supports recovery.', reason: 'The existing note covers this idea.' }
    }
    const proposed = await (await send('organize', 'fatigue', 'organize')).json() as StoredChatMessage
    assert.equal(proposed.proposal?.originalNote?.id, 'sleep')
    assert.deepEqual(notes.loadNotes(), [original])
    const resolve = (messageId: string, action: string) => fetch(`${url}/conversations/main/proposals/${messageId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, title: 'Rest and recovery', content: 'Sleep restores attention. Consistency supports recovery.' }),
    })
    assert.equal((await resolve(proposed.id, 'save')).status, 200)
    assert.equal(notes.loadNotes().length, 1)
    assert.equal((await resolve(proposed.id, 'undo')).status, 200)
    assert.deepEqual(notes.loadNotes(), [original])
    const stale = await (await send('stale-organize', 'fatigue', 'organize')).json() as StoredChatMessage
    notes.updateNote('sleep', { title: 'Manual change' })
    assert.equal((await resolve(stale.id, 'save')).status, 409)
    assert.equal(chats.findReply('stale-organize')?.proposal?.status, 'pending')
    assert.equal(notes.loadNotes()[0].title, 'Manual change')
  })
})
