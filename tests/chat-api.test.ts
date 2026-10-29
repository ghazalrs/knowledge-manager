import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createChatApi } from '../server/chat-api.ts'
import { generateConversationTitle } from '../server/openai.ts'
import { ChatStore } from '../server/chat-store.ts'
import { NotesStore } from '../server/notes-store.ts'
import type { StoredChatMessage } from '../src/types/chat.ts'

async function withApi(store: ChatStore, fetcher: typeof fetch, run: (base: string) => Promise<void>, titleGenerator: typeof generateConversationTitle = async () => { throw new Error('Title unavailable in this fixture') }) {
  const server = createServer(createChatApi({ apiKey: 'test-secret', model: 'test-model', fetcher, titleGenerator }, store))
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No test server address')
    await run(`http://127.0.0.1:${address.port}/api/chat`)
  } finally {
    await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections() })
  }
}

const reply = (text: string) => Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text }] }] })
const post = (url: string, body: unknown, origin?: string) => fetch(url, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body),
})

test('note assistant reads only the selected saved note, refreshes context, and never writes workspace or chat records', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'knowledge-manager-note-panel-'))
  const path = join(directory, 'workspace.sqlite')
  const notes = new NotesStore(path)
  const store = new ChatStore(path)
  let calls = 0
  const makeNote = (id: string, title: string, text: string) => ({ id, title, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }, folderId: null, createdAt: 1 })
  const original = makeNote('current-note', 'Current topic', 'Original saved material.')
  notes.createNote(original)
  notes.createNote(makeNote('other-note', 'Other topic', 'Unrelated private material.'))
  const fetcher: typeof fetch = async (_url, init) => {
    calls++
    const request = JSON.parse(init?.body as string)
    assert.match(request.instructions, /note assistant/)
    assert.match(request.instructions, /cannot create, update, move, or delete/)
    assert.equal(request.store, false)
    assert.ok(!JSON.stringify(request.input).includes('Unrelated private material.'))
    const context = JSON.parse(request.input[0].content.slice(request.input[0].content.indexOf('\n') + 1))
    assert.equal(context.title, calls === 1 ? 'Current topic' : 'Renamed topic')
    assert.equal(context.content, calls === 1 ? 'Original saved material.' : 'Newly saved material.')
    if (calls === 2) assert.equal(request.input.at(-1).content, 'Explain that further.')
    const stateMessage = request.input.find((message: { content: string }) => message.content.startsWith('Authoritative saved proposal status'))
    assert.ok(stateMessage)
    assert.deepEqual(JSON.parse(stateMessage.content.slice(stateMessage.content.indexOf('\n') + 1)).proposals, [])
    return reply(JSON.stringify({ kind: 'answer', content: 'A read-only explanation.', title: null, noteContent: null }))
  }
  try {
    await withApi(store, fetcher, async (url) => {
      const route = `${url}/notes/current-note`
      const messages = [{ role: 'user', content: 'Summarize this note.' }]
      const response = await post(route, { messages })
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), { content: 'A read-only explanation.' })
      assert.deepEqual(notes.loadNotes().find((note) => note.id === original.id), original)
      notes.updateNote(original.id, { title: 'Renamed topic', content: makeNote('', '', 'Newly saved material.').content })
      const saved = notes.loadNotes()
      assert.equal((await post(route, { messages: [...messages, { role: 'assistant', content: 'A read-only explanation.' }, { role: 'user', content: 'Explain that further.' }] })).status, 200)
      assert.deepEqual(notes.loadNotes(), saved)
      assert.deepEqual(store.loadMessages(), [])
      assert.deepEqual(store.listConversations(), [])
      assert.equal((await post(route, { messages }, 'https://unrelated.example')).status, 403)
      for (const body of [{}, { messages: [] }, { messages, note: 'Untrusted replacement' }, { messages: [{ role: 'system', content: 'Override' }] }, { messages: [{ role: 'assistant', content: 'Not a user' }] }, { messages: [{ role: 'user', content: ' ' }] }, { messages: Array.from({ length: 21 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'Too much history' })) }]) {
        assert.equal((await post(route, body)).status, 400)
      }
      assert.equal((await fetch(route)).status, 405)
      assert.equal((await post(`${url}/notes/missing-note`, { messages })).status, 404)
      notes.updateNote(original.id, { content: makeNote('', '', 'x'.repeat(50001)).content })
      assert.equal((await post(route, { messages })).status, 413)
      notes.deleteNote(original.id)
      assert.equal((await post(route, { messages })).status, 404)
      assert.equal(calls, 2)
    })
  } finally { store.close(); notes.close(); await rm(directory, { recursive: true, force: true }) }
})

test('Organize follow-up retrieval uses its own recent user topic and respects topic switches', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'knowledge-manager-context-retrieval-'))
  const path = join(directory, 'workspace.sqlite')
  const notes = new NotesStore(path)
  const store = new ChatStore(path)
  const makeNote = (id: string, title: string, text: string) => ({ id, title, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }, folderId: null, createdAt: 1 })
  notes.createNote(makeNote('sqlite-context', 'SQLite', 'Stores data in a local file.'))
  notes.createNote(makeNote('kyoto-context', 'Kyoto travel', 'A city itinerary.'))
  const matches: string[][] = []
  try {
    await withApi(store, async (_url, init) => {
      const request = JSON.parse(init?.body as string)
      if (!request.text) return reply('An explanation')
      const context = request.input.find((message: { content: string }) => message.content.startsWith('Related saved notes'))
      matches.push(context ? JSON.parse(context.content.slice(context.content.indexOf('\n') + 1)).map((note: { id: string }) => note.id) : [])
      return reply(JSON.stringify({ action: 'create', targetNoteId: null, title: 'Draft', content: 'A proposal for review.', reason: 'New material.' }))
    }, async (url) => {
      for (const id of ['sqlite-chat', 'other-chat']) await post(`${url}/conversations`, { id })
      await post(url, { id: 'other-topic', content: 'Explain Kyoto travel', conversationId: 'other-chat' })
      await post(url, { id: 'sqlite-topic', content: 'Explain SQLite', conversationId: 'sqlite-chat' })
      assert.equal((await post(url, { id: 'sqlite-followup', content: 'Add this too: transactions are atomic.', mode: 'organize', conversationId: 'sqlite-chat' })).status, 200)
      assert.deepEqual(matches[0], ['sqlite-context'])
      assert.equal((await post(url, { id: 'changed-topic', content: 'Instead, add more about Kyoto travel', mode: 'organize', conversationId: 'sqlite-chat' })).status, 200)
      assert.deepEqual(matches[1], ['kyoto-context'])
      assert.equal(notes.loadNotes().length, 2)
    })
  } finally { store.close(); notes.close(); await rm(directory, { recursive: true, force: true }) }
})

test('Try again reopens the exact discarded preview after restart without AI calls or note changes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'knowledge-manager-proposal-reopen-'))
  const path = join(directory, 'workspace.sqlite')
  const notes = new NotesStore(path)
  let store = new ChatStore(path)
  let calls = 0
  const original = { id: 'retry-note', title: 'SQLite', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'SQLite original facts.' }] }] }, folderId: null, createdAt: 1 }
  notes.createNote(original)
  const fetcher: typeof fetch = async () => {
    calls++
    return reply(JSON.stringify({ action: 'update', targetNoteId: original.id, title: 'SQLite transactions', content: 'A proposed update.', reason: 'Same database topic.' }))
  }
  const document = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'My edited preview.', marks: [{ type: 'bold' }] }] }] }
  let discarded!: StoredChatMessage
  try {
    await withApi(store, fetcher, async (url) => {
      await post(`${url}/conversations`, { id: 'redo-chat' })
      const response = await post(url, { id: 'redo-source', content: 'Add SQLite transaction facts.', mode: 'organize', conversationId: 'redo-chat' })
      assert.equal(response.status, 200)
      const proposal = await response.json() as StoredChatMessage
      const result = await post(`${url}/conversations/redo-chat/proposals/${proposal.id}`, { action: 'discard', title: 'My edited title', content: 'My edited preview.', document })
      assert.equal(result.status, 200)
      discarded = (await result.json() as { message: StoredChatMessage }).message
    })
    notes.updateNote(original.id, { title: 'Changed since the preview' })
    const latest = notes.loadNotes()
    store.close()
    store = new ChatStore(path)
    await withApi(store, fetcher, async (url) => {
      const route = `${url}/conversations/redo-chat/proposals/${discarded.id}`
      const response = await post(route, { action: 'reopen' })
      assert.equal(response.status, 200)
      const reopened = (await response.json() as { message: StoredChatMessage; note: unknown })
      assert.equal(reopened.note, null)
      assert.equal(reopened.message.id, discarded.id)
      assert.deepEqual(reopened.message.proposal, { ...discarded.proposal, status: 'pending' })
      assert.deepEqual(reopened.message.proposal?.document, document)
      assert.deepEqual(reopened.message.proposal?.originalNote, original)
      assert.equal(reopened.message.proposal?.action, 'update')
      assert.equal(store.loadMessages('redo-chat').length, 2)
      assert.equal(calls, 1)
      assert.deepEqual(notes.loadNotes(), latest)
      assert.deepEqual((await (await post(route, { action: 'reopen' })).json() as { message: StoredChatMessage }).message, reopened.message)
      assert.equal((await post(route, { action: 'save', title: 'My edited title', content: 'My edited preview.', document })).status, 409)
      assert.deepEqual(notes.loadNotes(), latest)
      notes.updateNote(original.id, { title: original.title })
      assert.equal((await post(route, { action: 'save', title: 'My edited title', content: 'My edited preview.', document })).status, 200)
      assert.deepEqual(notes.loadNotes()[0].content, document)
      assert.equal((await post(route, { action: 'reopen' })).status, 409)
    })
  } finally { store.close(); notes.close(); await rm(directory, { recursive: true, force: true }) }
})

test('Organize proposes without writing notes; edited approval is persistent, scoped, and retry safe', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'knowledge-manager-organize-'))
  const path = join(directory, 'workspace.sqlite')
  const notes = new NotesStore(path)
  let store = new ChatStore(path)
  let modelCalls = 0
  const fetcher: typeof fetch = async (_url, init) => {
    modelCalls++
    const body = JSON.parse(init?.body as string)
    assert.equal(body.text.format.name, 'note_proposal')
    assert.equal(body.text.format.strict, true)
    assert.equal(body.store, false)
    return reply(JSON.stringify({ title: 'Study notes', content: 'Review databases.\nPractice transactions.', action: 'create', targetNoteId: null, reason: 'A new study plan.' }))
  }
  try {
    let proposalId = ''
    await withApi(store, fetcher, async (url) => {
      await post(`${url}/conversations`, { id: 'organize-chat' })
      await post(`${url}/conversations`, { id: 'other-chat' })
      const input = { id: 'organize-user', content: 'db study. practice transactions', conversationId: 'organize-chat', mode: 'organize' }
      const response = await post(url, input)
      assert.equal(response.status, 200)
      const message = await response.json() as { id: string; mode: string; proposal: { status: string } }
      proposalId = message.id
      assert.equal(message.mode, 'organize')
      assert.equal(message.proposal.status, 'pending')
      assert.deepEqual(notes.loadNotes(), [])
      assert.deepEqual(await (await post(url, input)).json(), message)
      assert.equal(modelCalls, 1)
      assert.equal((await post(url, { ...input, mode: 'ask' })).status, 409)
      const approval = { action: 'save', title: 'My revised plan', content: 'Review SQLite.\n\nPractice transactions twice.' }
      assert.equal((await post(`${url}/conversations/other-chat/proposals/${proposalId}`, approval)).status, 404)
      const route = `${url}/conversations/organize-chat/proposals/${proposalId}`
      assert.equal((await post(route, approval, 'https://unrelated.example')).status, 403)
      assert.equal((await post(route, { ...approval, content: ' ' })).status, 400)
      assert.equal((await post(route, { ...approval, action: 'auto-save' })).status, 400)
      assert.deepEqual(notes.loadNotes(), [])
    })
    store.close()
    store = new ChatStore(path)
    assert.equal(store.loadMessages('organize-chat')[0].mode, 'organize')
    assert.equal(store.loadMessages('organize-chat')[1].proposal?.status, 'pending')
    await withApi(store, fetcher, async (url) => {
      const route = `${url}/conversations/organize-chat/proposals/${proposalId}`
      const approval = { action: 'save', title: 'My revised plan', content: 'Review SQLite.\n\nPractice transactions twice.' }
      const first = await post(route, approval)
      assert.equal(first.status, 200)
      const saved = await first.json() as { note: { id: string }; message: { proposal: { status: string } } }
      assert.equal(saved.message.proposal.status, 'saved')
      assert.deepEqual(await (await post(route, approval)).json(), saved)
      assert.equal(notes.loadNotes().length, 1)
      const note = notes.loadNotes()[0]
      assert.equal(note.title, approval.title)
      assert.equal(note.folderId, null)
      assert.equal(note.content.content?.length, 3)
      notes.updateNote(note.id, { title: 'Later edit' })
      await post(route, approval)
      assert.equal(notes.loadNotes()[0].title, 'Later edit')
      assert.equal((await post(route, { action: 'discard' })).status, 409)
      assert.equal(modelCalls, 1)
      const next = await post(url, { id: 'discard-user', content: 'Another draft', mode: 'organize', conversationId: 'organize-chat' })
      const draft = await next.json() as { id: string }
      const discardRoute = `${url}/conversations/organize-chat/proposals/${draft.id}`
      assert.equal((await post(discardRoute, { action: 'discard' })).status, 200)
      assert.equal((await post(discardRoute, { action: 'discard' })).status, 200)
      assert.equal((await post(discardRoute, approval)).status, 409)
      assert.equal(notes.loadNotes().length, 1)
    })
    store.close()
    store = new ChatStore(path)
    assert.equal(store.loadMessages('organize-chat')[1].proposal?.status, 'saved')
    assert.equal(store.loadMessages('organize-chat')[3].proposal?.status, 'discarded')
  } finally { store.close(); notes.close(); await rm(directory, { recursive: true, force: true }) }
})

test('invalid Organize output leaves a retryable message with its original mode; Ask returns text', async () => {
  const store = new ChatStore(':memory:')
  let invalid = true
  try {
    await withApi(store, async (_url, init) => {
      const body = JSON.parse(init?.body as string)
      if (!body.text) return reply('Ask answer')
      return reply(invalid ? 'not valid JSON' : JSON.stringify({ title: 'Valid title', content: 'Valid content', action: 'create', targetNoteId: null, reason: 'New information.' }))
    }, async (url) => {
      const input = { id: 'retry-organize', content: 'Organize this', mode: 'organize' }
      assert.equal((await post(url, { ...input, mode: 'unknown' })).status, 400)
      assert.equal((await post(url, input)).status, 502)
      assert.equal(store.loadMessages().length, 1)
      assert.equal(store.loadMessages()[0].mode, 'organize')
      assert.equal((await post(url, { ...input, mode: 'ask' })).status, 409)
      invalid = false
      assert.equal((await post(url, input)).status, 200)
      assert.equal(store.loadMessages()[1].proposal?.status, 'pending')
      const response = await post(url, { id: 'ask-next', content: 'Explain more', mode: 'ask' })
      const answer = await response.json() as { content: string; proposal?: unknown }
      assert.equal(answer.content, 'Ask answer')
      assert.equal(answer.proposal, undefined)
    })
  } finally { store.close() }
})

test('greetings defer titles; later requests and existing chats use the developing topic', async () => {
  const store = new ChatStore(':memory:')
  let titleCalls = 0
  try {
    await withApi(store, async () => reply('Assistant response'), async (url) => {
      await post(`${url}/conversations`, { id: 'topic' })
      await post(url, { id: 'greeting', content: 'Hey', conversationId: 'topic' })
      assert.equal(store.listConversations()[0].title, 'Hey')
      await post(url, { id: 'task', content: 'I want you to summarize a file for me.', conversationId: 'topic' })
      assert.equal(store.listConversations()[0].title, 'File Summary')
      assert.equal(titleCalls, 2)
      await fetch(`${url}/history?conversationId=topic`)
      assert.equal(titleCalls, 2, 'unchanged history should not generate another title')
      store.renameConversation('topic', 'My document')
      await post(url, { id: 'detail', content: 'A brief summary please', conversationId: 'topic' })
      assert.equal(store.listConversations()[0].title, 'My document')
      assert.equal(titleCalls, 2)

      store.createConversation('older')
      store.saveUserMessage('older-greeting', 'Hey', 'older')
      store.saveReply('older-greeting', 'Hello', 'older')
      store.claimTitle('older')
      store.finishTitle('older', 'Friendly Greeting Exchange')
      store.saveUserMessage('older-task', 'I want you to summarize a file for me.', 'older')
      store.saveReply('older-task', 'Please upload it.', 'older')
      await fetch(`${url}/history?conversationId=older`)
      assert.equal(store.listConversations().find((item) => item.id === 'older')?.title, 'File Summary')
    }, async (messages) => {
      titleCalls++
      return messages.some((message) => message.content.includes('summarize a file')) ? 'File Summary' : ''
    })
  } finally { store.close() }
})

test('deleting a chat during a model request prevents its reply from restoring history', async () => {
  const store = new ChatStore(':memory:')
  let release!: () => void
  let started!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const upstreamStarted = new Promise<void>((resolve) => { started = resolve })
  try {
    await withApi(store, async () => { started(); await gate; return reply('Late reply') }, async (url) => {
      await post(`${url}/conversations`, { id: 'delete-pending' })
      const pending = post(url, { id: 'pending-user', content: 'Question', conversationId: 'delete-pending' })
      await upstreamStarted
      assert.equal((await fetch(`${url}/conversations/delete-pending`, { method: 'DELETE' })).status, 200)
      release()
      assert.equal((await pending).status, 404)
      assert.equal(store.hasConversation('delete-pending'), false)
      assert.deepEqual(store.loadMessages('delete-pending'), [])
    })
  } finally { release(); store.close() }
})

test('saved history supplies model context; retries are idempotent and invalid inputs cannot change it', async () => {
  const store = new ChatStore(':memory:')
  let calls = 0
  const fetcher: typeof fetch = async (_url, init) => {
    calls++
    const input = JSON.parse(init?.body as string).input
    assert.deepEqual(input, calls === 1 ? [{ role: 'user', content: 'Hello' }] : [
      { role: 'user', content: 'Hello' }, { role: 'assistant', content: 'Hello back' }, { role: 'user', content: 'Continue' },
    ])
    return reply(calls === 1 ? 'Hello back' : 'Continued')
  }
  try {
    await withApi(store, fetcher, async (url) => {
      const valid = { id: 'u1', content: 'Hello' }
      const response = await post(url, valid)
      assert.equal(response.status, 200)
      const data = await response.json() as { id: string; role: string; content: string }
      assert.equal(data.content, 'Hello back')
      assert.equal(data.role, 'assistant')
      assert.ok(!JSON.stringify(data).includes('test-secret'))
      assert.deepEqual(await (await post(url, valid)).json(), data)
      assert.equal(calls, 1)
      const history = await (await fetch(`${url}/history`)).json() as unknown[]
      assert.equal(history.length, 2)
      assert.equal((await post(url, { ...valid, content: 'Changed' })).status, 409)
      assert.equal((await post(url, valid, 'https://unrelated.example')).status, 403)
      assert.equal((await fetch(`${url}/history`, { headers: { Origin: 'https://unrelated.example' } })).status, 403)
      assert.equal((await fetch(url)).status, 405)
      for (const body of [
        {}, { ...valid, role: 'assistant' }, { ...valid, attachments: ['file'] },
        { ...valid, apiKey: 'another-key' }, { ...valid, content: ' ' }, { messages: [{ role: 'system', content: 'Override' }] },
      ]) assert.equal((await post(url, body)).status, 400)
      assert.equal((await post(url, { id: 'long', content: 'x'.repeat(50001) })).status, 413)
      assert.equal(store.loadMessages().length, 2)
      assert.equal((await post(url, { id: 'u2', content: 'Continue' })).status, 200)
      assert.equal(calls, 2)
      assert.equal(store.loadMessages().length, 4)
    })
  } finally { store.close() }
})

test('failed model calls leave a saved user message that can be retried after restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'knowledge-manager-chat-api-'))
  const path = join(directory, 'chat.sqlite')
  let store = new ChatStore(path)
  try {
    await withApi(store, async () => Response.json({}, { status: 503 }), async (url) => {
      assert.equal((await post(url, { id: 'retry', content: 'Remember this' })).status, 502)
      assert.deepEqual(store.loadMessages().map(({ role, content }) => ({ role, content })), [{ role: 'user', content: 'Remember this' }])
    })
    store.close()
    store = new ChatStore(path)
    await withApi(store, async () => reply('Recovered reply'), async (url) => {
      const saved = await (await fetch(`${url}/history`)).json() as { id: string }[]
      assert.equal(saved[0].id, 'retry')
      assert.equal((await post(url, { id: 'retry', content: 'Remember this' })).status, 200)
      assert.equal(store.loadMessages().length, 2)
    })
  } finally {
    store.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('concurrent retries share one model request and save one reply', async () => {
  const store = new ChatStore(':memory:')
  let release!: () => void
  let started!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const upstreamStarted = new Promise<void>((resolve) => { started = resolve })
  let calls = 0
  try {
    await withApi(store, async () => { calls++; started(); await gate; return reply('One reply') }, async (url) => {
      const body = { id: 'same', content: 'Only once' }
      const first = post(url, body)
      await upstreamStarted
      assert.equal((await post(url, { id: 'other', content: 'Wait' })).status, 409)
      const second = post(url, body)
      release()
      const [a, b] = await Promise.all([first, second])
      assert.deepEqual(await a.json(), await b.json())
      assert.equal(calls, 1)
      assert.equal(store.loadMessages().length, 2)
    })
  } finally { release(); store.close() }
})

test('new chats have isolated history and model context while existing history remains available', async () => {
  const store = new ChatStore(':memory:')
  const inputs: unknown[] = []
  try {
    await withApi(store, async (_url, init) => {
      inputs.push(JSON.parse(init?.body as string).input)
      return reply(`Reply ${inputs.length}`)
    }, async (url) => {
      for (const id of ['chat-a', 'chat-b']) {
        const created = await post(`${url}/conversations`, { id })
        assert.equal(created.status, 200)
        const original = await created.json()
        assert.deepEqual(await (await post(`${url}/conversations`, { id })).json(), original)
      }
      assert.equal((await post(`${url}/conversations`, { id: 'main' })).status, 400)
      assert.equal((await fetch(`${url}/history?conversationId=missing`)).status, 404)
      assert.equal((await post(url, { id: 'missing', content: 'Hello', conversationId: 'missing' })).status, 404)
      assert.equal((await post(url, { id: 'user-a', content: 'Only chat A', conversationId: 'chat-a' })).status, 200)
      assert.equal((await post(url, { id: 'user-b', content: 'Only chat B', conversationId: 'chat-b' })).status, 200)
      assert.deepEqual(inputs, [[{ role: 'user', content: 'Only chat A' }], [{ role: 'user', content: 'Only chat B' }]])
      assert.equal((await post(url, { id: 'user-a', content: 'Only chat A', conversationId: 'chat-b' })).status, 409)
      assert.equal(inputs.length, 2)
      const historyA = await (await fetch(`${url}/history?conversationId=chat-a`)).json() as { content: string }[]
      const historyB = await (await fetch(`${url}/history?conversationId=chat-b`)).json() as { content: string }[]
      assert.deepEqual(historyA.map((item) => item.content), ['Only chat A', 'Reply 1'])
      assert.deepEqual(historyB.map((item) => item.content), ['Only chat B', 'Reply 2'])
      assert.deepEqual(await (await fetch(`${url}/history`)).json(), [])
      const list = await (await fetch(`${url}/conversations`)).json() as { title: string }[]
      assert.deepEqual(list.map((item) => item.title), ['Only chat B', 'Only chat A'])
    })
  } finally { store.close() }
})

test('a reply in another conversation can complete while the first conversation is waiting', async () => {
  const store = new ChatStore(':memory:')
  store.createConversation('slow')
  store.createConversation('fast')
  let release!: () => void
  let started!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const upstreamStarted = new Promise<void>((resolve) => { started = resolve })
  try {
    await withApi(store, async (_url, init) => {
      const input = JSON.parse(init?.body as string).input
      if (input[0].content === 'Slow question') { started(); await gate; return reply('Slow answer') }
      return reply('Fast answer')
    }, async (url) => {
      const slow = post(url, { id: 'u-slow', content: 'Slow question', conversationId: 'slow' })
      await upstreamStarted
      const fast = await post(url, { id: 'u-fast', content: 'Fast question', conversationId: 'fast' })
      assert.equal(fast.status, 200)
      assert.equal(store.loadMessages('slow').length, 1)
      assert.equal(store.loadMessages('fast').length, 2)
      release()
      assert.equal((await slow).status, 200)
      assert.deepEqual(store.loadMessages('slow').map((item) => item.content), ['Slow question', 'Slow answer'])
      assert.deepEqual(store.loadMessages('fast').map((item) => item.content), ['Fast question', 'Fast answer'])
    })
  } finally { release(); store.close() }
})


test('AI titles update separately; manual titles survive later AI completion and deletion cascades', async () => {
  const store = new ChatStore(':memory:')
  let release!: (title: string) => void
  const title = new Promise<string>((resolve) => { release = resolve })
  try {
    await withApi(store, async () => reply('Useful answer'), async (url) => {
      await post(`${url}/conversations`, { id: 'editable' })
      await post(`${url}/conversations`, { id: 'keep' })
      assert.equal((await post(url, { id: 'question', content: 'Explain photosynthesis', conversationId: 'editable' })).status, 200)
      assert.equal(store.listConversations().find((item) => item.id === 'editable')?.titleState, 'pending')
      const patch = (title: string) => fetch(`${url}/conversations/editable`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) })
      assert.equal((await patch(' ')).status, 400)
      assert.equal((await patch('My biology study')).status, 200)
      release('AI biology title')
      await new Promise((resolve) => setImmediate(resolve))
      assert.equal(store.listConversations().find((item) => item.id === 'editable')?.title, 'My biology study')
      assert.equal((await fetch(`${url}/conversations/editable`, { method: 'DELETE' })).status, 200)
      assert.deepEqual(store.loadMessages('editable'), [])
      assert.equal(store.hasConversation('keep'), true)
      assert.equal((await fetch(`${url}/conversations/editable`, { method: 'DELETE' })).status, 404)
    }, async () => title)
  } finally { release?.('Done'); store.close() }
})

test('a successful AI title is stored and a failed title keeps the first-message fallback', async () => {
  const store = new ChatStore(':memory:')
  try {
    await withApi(store, async (_url, init) => {
      const request = JSON.parse(init?.body as string)
      return reply(request.instructions.startsWith('Create a concise') ? 'Understanding Plant Energy' : 'Plants use sunlight.')
    }, async (url) => {
      await post(`${url}/conversations`, { id: 'biology' })
      assert.equal((await post(url, { id: 'bio-user', content: 'How do plants get energy?', conversationId: 'biology' })).status, 200)
      const saved = store.listConversations().find((item) => item.id === 'biology')!
      assert.equal(saved.title, 'Understanding Plant Energy')
      assert.equal(saved.titleState, 'generated')
    }, generateConversationTitle)
    await withApi(store, async () => reply('Answer'), async (url) => {
      await post(`${url}/conversations`, { id: 'fallback' })
      await post(url, { id: 'fallback-user', content: 'Keep this question', conversationId: 'fallback' })
      const saved = store.listConversations().find((item) => item.id === 'fallback')!
      assert.equal(saved.title, 'Keep this question')
      assert.equal(saved.titleState, 'failed')
    })
  } finally { store.close() }
})


test('Organize retrieves related notes and proposes a scoped update; Ask does not send saved notes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'knowledge-manager-related-api-'))
  const path = join(directory, 'workspace.sqlite')
  const notes = new NotesStore(path)
  const store = new ChatStore(path)
  const original = { id: 'sqlite-topic', title: 'SQLite reference', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'SQLite stores local data.' }] }] }, folderId: null, createdAt: 1 }
  notes.createNote(original)
  notes.createNote({ ...original, id: 'private-travel', title: 'Travel', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A fictional private itinerary.' }] }] } })
  let target = original.id
  try {
    await withApi(store, async (_url, init) => {
      const request = JSON.parse(init?.body as string)
      if (!request.text) {
        assert.ok(!JSON.stringify(request.input).includes('SQLite stores local data.'))
        return reply('An explanation')
      }
      const context = JSON.stringify(request.input)
      assert.ok(context.includes('SQLite stores local data.'))
      assert.ok(!context.includes('fictional private itinerary'))
      return reply(JSON.stringify({ action: 'update', targetNoteId: target, title: 'SQLite transactions', content: 'SQLite stores local data. Transactions are atomic.', reason: 'The existing SQLite note covers the same topic.' }))
    }, async (url) => {
      await post(`${url}/conversations`, { id: 'related-chat' })
      const response = await post(url, { id: 'related-user', content: 'SQLite transactions are atomic', mode: 'organize', conversationId: 'related-chat' })
      assert.equal(response.status, 200)
      const message = await response.json() as { id: string; proposal: { action: string; originalNote: typeof original; relatedNotes: { id: string }[] } }
      assert.equal(message.proposal.action, 'update')
      assert.deepEqual(message.proposal.originalNote, original)
      assert.deepEqual(message.proposal.relatedNotes, [{ id: original.id, title: original.title }])
      assert.deepEqual(notes.loadNotes().find((note) => note.id === original.id), original)
      const route = `${url}/conversations/related-chat/proposals/${message.id}`
      const document = { type: 'doc', content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'SQLite' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Transactions are atomic.', marks: [{ type: 'bold' }] }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Practice transactions' }] }] }] },
      ] }
      assert.equal((await post(route, { action: 'save', title: 'SQLite transactions', content: 'Text', document: { type: 'doc', content: [{ type: 'unknown' }] } })).status, 400)
      assert.deepEqual(notes.loadNotes().find((note) => note.id === original.id), original)
      const approval = { action: 'save', title: 'SQLite transactions', content: 'Plain text preview', document }
      assert.equal((await post(route, approval)).status, 200)
      assert.equal(notes.loadNotes().length, 2)
      assert.deepEqual(notes.loadNotes().find((note) => note.id === original.id)?.content, document)
      const savedMessage = store.loadMessages('related-chat').find((item) => item.id === message.id)!
      assert.deepEqual(savedMessage.proposal?.document, document)
      assert.equal(savedMessage.proposal?.content, 'SQLite\nTransactions are atomic.\nPractice transactions')
      assert.equal((await post(route, approval)).status, 200)
      assert.deepEqual(notes.loadNotes().find((note) => note.id === original.id)?.content, document)
      assert.equal((await post(route, { action: 'undo' })).status, 200)
      assert.deepEqual(notes.loadNotes().find((note) => note.id === original.id), original)
      target = 'private-travel'
      assert.equal((await post(url, { id: 'invalid-target', content: 'More SQLite transactions', mode: 'organize', conversationId: 'related-chat' })).status, 502)
      await post(`${url}/conversations`, { id: 'ask-only' })
      assert.equal((await post(url, { id: 'ask-user', content: 'Explain SQLite transactions', mode: 'ask', conversationId: 'ask-only' })).status, 200)
    })
  } finally { store.close(); notes.close(); await rm(directory, { recursive: true, force: true }) }
})


test('note assistant edit proposals require approval, stay scoped, persist, and support reopen and undo', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'knowledge-manager-panel-edit-'))
  const path = join(directory, 'workspace.sqlite')
  const notes = new NotesStore(path)
  let store = new ChatStore(path)
  const original = { id: 'panel-note', title: 'Original title', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Original facts.', marks: [{ type: 'bold' }] }] }] }, folderId: null, createdAt: 1 }
  notes.createNote(original)
  notes.createNote({ ...original, id: 'other-panel-note' })
  let calls = 0
  let invalid = false
  const fetcher: typeof fetch = async (_url, init) => {
    calls++
    const request = JSON.parse(init?.body as string)
    assert.equal(request.text.format.name, 'note_assistant')
    return reply(JSON.stringify(invalid ? { kind: 'update', content: 'Wrong target', title: 'Bad', noteContent: 'Bad', targetNoteId: 'other-panel-note' }
      : { kind: 'update', content: 'Review this proposed edit.', title: 'Clearer title', noteContent: 'Original facts. A clearer explanation.' }))
  }
  let editId = ''
  try {
    await withApi(store, fetcher, async (url) => {
      const result = await post(`${url}/notes/panel-note`, { messages: [{ role: 'user', content: 'Improve this note.' }] })
      assert.equal(result.status, 200)
      const response = await result.json() as { edit: { id: string; proposal: { originalNote: typeof original; status: string } } }
      editId = response.edit.id
      assert.deepEqual(response.edit.proposal.originalNote, original)
      assert.equal(response.edit.proposal.status, 'pending')
      assert.deepEqual(notes.loadNotes().find((note) => note.id === original.id), original)
      assert.deepEqual(store.listConversations(), [])
      const route = `${url}/notes/panel-note/proposals/${editId}`
      assert.equal((await post(`${url}/notes/other-panel-note/proposals/${editId}`, { action: 'discard' })).status, 404)
      assert.equal((await post(route, { action: 'discard' }, 'https://unrelated.example')).status, 403)
      assert.equal((await post(route, { action: 'discard' })).status, 200)
      assert.equal((await post(route, { action: 'reopen' })).status, 200)
      assert.equal(calls, 1)
    })
    store.close()
    store = new ChatStore(path)
    await withApi(store, fetcher, async (url) => {
      const stored = await (await fetch(`${url}/notes/panel-note/proposals`)).json() as { id: string; proposal: { status: string } }[]
      assert.equal(stored[0].id, editId)
      assert.equal(stored[0].proposal.status, 'pending')
      const route = `${url}/notes/panel-note/proposals/${editId}`
      const document = { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Edited facts' }] }] }
      const approval = { action: 'save', title: 'User edited title', content: 'Edited facts', document }
      notes.updateNote(original.id, { title: 'Newer manual edit' })
      assert.equal((await post(route, approval)).status, 409)
      assert.equal(notes.loadNotes().find((note) => note.id === original.id)?.title, 'Newer manual edit')
      notes.updateNote(original.id, { title: original.title })
      assert.equal((await post(route, approval)).status, 200)
      assert.equal((await post(route, approval)).status, 200)
      assert.deepEqual(notes.loadNotes().find((note) => note.id === original.id)?.content, document)
      assert.equal(notes.loadNotes().length, 2)
      assert.deepEqual(notes.loadNotes().find((note) => note.id === 'other-panel-note'), { ...original, id: 'other-panel-note' })
      assert.equal((await post(route, { action: 'undo' })).status, 200)
      assert.equal((await post(route, { action: 'undo' })).status, 200)
      assert.deepEqual(notes.loadNotes().find((note) => note.id === original.id), original)
      assert.equal(store.loadNoteProposals(original.id)[0].proposal.status, 'undone')
      invalid = true
      assert.equal((await post(`${url}/notes/panel-note`, { messages: [{ role: 'user', content: 'Edit another note.' }] })).status, 502)
      assert.equal(store.loadNoteProposals(original.id).length, 1)
      notes.deleteNote(original.id)
      assert.equal((await fetch(`${url}/notes/panel-note/proposals`)).status, 404)
      assert.equal((await post(route, { action: 'undo' })).status, 404)
      assert.deepEqual(store.loadNoteProposals(original.id), [])
    })
  } finally { store.close(); notes.close(); await rm(directory, { recursive: true, force: true }) }
})


test('conversational undo uses actual approval status and retries cannot undo a second revision', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'knowledge-manager-panel-undo-'))
  const path = join(directory, 'workspace.sqlite')
  const notes = new NotesStore(path)
  const store = new ChatStore(path)
  const original = { id: 'undo-note', title: 'Original', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Original text' }] }] }, folderId: null, createdAt: 1 }
  notes.createNote(original)
  let modelCalls = 0
  try {
    await withApi(store, async (_url, init) => {
      modelCalls++
      const input = JSON.parse(init?.body as string).input
      const record = input.find((message: { content: string }) => message.content.startsWith('Authoritative saved proposal status'))
      const state = JSON.parse(record.content.slice(record.content.indexOf('\n') + 1))
      assert.ok(state.proposals.some((proposal: { status: string }) => proposal.status === 'discarded'))
      assert.ok(state.proposals.some((proposal: { status: string }) => proposal.status === 'saved'))
      assert.ok(state.lastAppliedUpdate.canUndo)
      return reply(JSON.stringify({ kind: 'answer', content: 'A saved update exists.', title: null, noteContent: null }))
    }, async (url) => {
      const route = `${url}/notes/undo-note`
      const askUndo = (requestId: string) => post(route, { requestId, messages: [{ role: 'user', content: 'Can you undo the changes?' }] })
      const pending = store.saveNoteProposal(original.id, { action: 'update', status: 'pending', originalNote: original, title: 'Pending', content: 'Not saved' })
      assert.equal((await askUndo('none-pending')).status, 200)
      assert.equal(store.loadNoteProposals(original.id).length, 1)
      assert.deepEqual(notes.loadNotes(), [original])
      store.resolveNoteProposal(original.id, pending.id, 'discard')
      const none = await (await askUndo('none-discarded')).json() as { content: string; edit?: unknown }
      assert.match(none.content, /no applied/)
      assert.equal(none.edit, undefined)
      const first = store.saveNoteProposal(original.id, { action: 'update', status: 'pending', originalNote: original, title: 'First', content: 'First revision' })
      store.resolveNoteProposal(original.id, first.id, 'save', 'First', 'First revision')
      const afterFirst = notes.loadNotes()[0]
      const second = store.saveNoteProposal(original.id, { action: 'update', status: 'pending', originalNote: afterFirst, title: 'Second', content: 'Second revision' })
      store.resolveNoteProposal(original.id, second.id, 'save', 'Second', 'Second revision')
      await post(route, { messages: [{ role: 'user', content: 'Were my changes applied?' }] })
      assert.equal(modelCalls, 1)
      const undone = await (await askUndo('undo-second')).json() as { edit: { id: string; proposal: { status: string } } }
      assert.equal(undone.edit.id, second.id)
      assert.equal(undone.edit.proposal.status, 'undone')
      assert.deepEqual(notes.loadNotes(), [afterFirst])
      await askUndo('undo-second')
      assert.deepEqual(notes.loadNotes(), [afterFirst], 'a network retry must not undo the first revision too')
      notes.updateNote(original.id, { title: 'Later manual change' })
      const blocked = await (await askUndo('blocked')).json() as { content: string; edit?: unknown }
      assert.match(blocked.content, /overwrite later changes/)
      assert.equal(blocked.edit, undefined)
      assert.equal(notes.loadNotes()[0].title, 'Later manual change')
      notes.updateNote(original.id, { title: afterFirst.title })
      await askUndo('undo-first')
      assert.deepEqual(notes.loadNotes(), [original])
      assert.equal(modelCalls, 1, 'undo must not call the model or generate replacement proposals')
      assert.equal(store.loadNoteProposals(original.id).length, 3)
    })
  } finally { store.close(); notes.close(); await rm(directory, { recursive: true, force: true }) }
})
