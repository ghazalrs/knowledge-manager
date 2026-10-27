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
    return reply(JSON.stringify({ title: 'Study notes', content: 'Review databases.\nPractice transactions.' }))
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
      return reply(invalid ? 'not valid JSON' : JSON.stringify({ title: 'Valid title', content: 'Valid content' }))
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
