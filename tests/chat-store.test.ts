import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { ChatStore } from '../server/chat-store.ts'
import { NotesStore } from '../server/notes-store.ts'

test('chat text survives reopening in order without duplicate messages or changes to notes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'knowledge-manager-chat-'))
  const path = join(directory, 'knowledge.sqlite')
  const note = { id: 'note', title: 'Keep me', createdAt: 1, folderId: null, content: { type: 'doc', content: [] } }
  const notes = new NotesStore(path)
  notes.createNote(note)
  notes.close()
  let store = new ChatStore(path)
  try {
    assert.deepEqual(store.loadMessages(), [])
    assert.equal(store.saveUserMessage('u1', 'First question'), true)
    const firstReply = store.saveReply('u1', 'First reply')
    assert.equal(store.saveUserMessage('u1', 'First question'), true)
    assert.equal(store.saveUserMessage('u1', 'Changed question'), false)
    assert.deepEqual(store.saveReply('u1', 'Duplicate reply'), firstReply)
    store.saveUserMessage('u2', 'Second question')
    store.saveReply('u2', 'Second reply')
    const saved = store.loadMessages()
    assert.deepEqual(saved.map(({ role, content }) => ({ role, content })), [
      { role: 'user', content: 'First question' }, { role: 'assistant', content: 'First reply' },
      { role: 'user', content: 'Second question' }, { role: 'assistant', content: 'Second reply' },
    ])
    assert.deepEqual(store.contextThrough('u1').map((message) => message.id), ['u1'])
    store.close()
    store = new ChatStore(path)
    assert.deepEqual(store.loadMessages(), saved)
    assert.deepEqual(store.findReply('u1'), firstReply)
    assert.throws(() => store.saveReply('missing-user', 'Orphan reply'), /does not belong/)
    const restoredNotes = new NotesStore(path)
    try { assert.deepEqual(restoredNotes.loadNotes(), [note]) }
    finally { restoredNotes.close() }
  } finally {
    store.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('separate conversations and legacy history survive reopening without cross-chat messages', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'knowledge-manager-conversations-'))
  const path = join(directory, 'chat.sqlite')
  let store = new ChatStore(path)
  try {
    assert.deepEqual(store.listConversations(), [])
    store.saveUserMessage('legacy-user', 'Original history')
    store.saveReply('legacy-user', 'Original reply')
    const first = store.createConversation('first-chat')
    assert.deepEqual(store.createConversation('first-chat'), first)
    store.createConversation('second-chat')
    store.saveUserMessage('u-a', '  First\n question ', 'first-chat')
    const firstReply = store.saveReply('u-a', 'Reply A', 'first-chat')
    store.saveUserMessage('u-b', 'Question B', 'second-chat')
    store.saveReply('u-b', 'Reply B', 'second-chat')
    assert.equal(store.saveUserMessage('u-a', '  First\n question ', 'second-chat'), false)
    assert.equal(store.findReply('u-a', 'second-chat'), undefined)
    assert.deepEqual(store.contextThrough('u-a', 'second-chat'), [])
    assert.throws(() => store.saveReply('u-a', 'Wrong chat', 'second-chat'), /does not belong/)
    const firstHistory = store.loadMessages('first-chat')
    const secondHistory = store.loadMessages('second-chat')
    store.close()
    store = new ChatStore(path)
    assert.deepEqual(store.loadMessages('first-chat'), firstHistory)
    assert.deepEqual(store.loadMessages('second-chat'), secondHistory)
    assert.deepEqual(store.findReply('u-a', 'first-chat'), firstReply)
    assert.deepEqual(store.listConversations().map(({ id, title }) => ({ id, title })), [
      { id: 'second-chat', title: 'Question B' }, { id: 'first-chat', title: 'First question' }, { id: 'main', title: 'Original history' },
    ])
    assert.equal(store.loadMessages().length, 2)
  } finally {
    store.close()
    await rm(directory, { recursive: true, force: true })
  }
})


test('manual titles persist and late title completion cannot recreate a deleted chat', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'knowledge-manager-titles-'))
  const path = join(directory, 'chat.sqlite')
  let store = new ChatStore(path)
  try {
    store.createConversation('manual')
    assert.equal(store.claimTitle('manual'), true)
    store.renameConversation('manual', 'Chosen title')
    store.finishTitle('manual', 'Late AI title')
    store.close()
    store = new ChatStore(path)
    assert.equal(store.listConversations()[0].title, 'Chosen title')
    assert.equal(store.claimTitle('manual'), false)
    store.createConversation('deleted')
    store.saveUserMessage('deleted-user', 'Question', 'deleted')
    store.saveReply('deleted-user', 'Answer', 'deleted')
    store.claimTitle('deleted')
    store.deleteConversation('deleted')
    store.finishTitle('deleted', 'Late title')
    assert.equal(store.hasConversation('deleted'), false)
    assert.deepEqual(store.loadMessages('deleted'), [])
    assert.equal(store.listConversations().length, 1)
  } finally {
    store.close()
    await rm(directory, { recursive: true, force: true })
  }
})
