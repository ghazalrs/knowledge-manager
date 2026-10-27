import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { ChatStore } from '../server/chat-store.ts'
import { NotesStore } from '../server/notes-store.ts'
import { textDocument } from '../src/lib/note-text.ts'

test('updates preserve versions and folder placement; stale approval and undo never overwrite later edits', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'knowledge-manager-revisions-'))
  const path = join(directory, 'workspace.sqlite')
  const notes = new NotesStore(path)
  let store = new ChatStore(path)
  const setup = new DatabaseSync(path)
  try {
    notes.createFolder({ id: 'learning', name: 'Learning', createdAt: 1 })
    const original = { id: 'sqlite', title: 'SQLite notes', content: { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Original heading', marks: [{ type: 'bold' }] }] }] }, folderId: 'learning', createdAt: 1 }
    notes.createNote(original)
    store.createConversation('updates')
    function propose(id: string) {
      store.saveUserMessage(id, 'Add SQLite transactions', 'updates', 'organize')
      return store.saveReply(id, 'Review update', 'updates', { action: 'update', title: 'SQLite transactions', content: 'Original heading\nTransactions are atomic.', status: 'pending', originalNote: notes.loadNotes()[0] })
    }
    const first = propose('first')
    assert.deepEqual(notes.loadNotes(), [original])
    store.close()
    store = new ChatStore(path)
    const rich = { type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Original heading' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Transactions are atomic.', marks: [{ type: 'italic' }] }] },
    ] }
    const saved = store.resolveProposal('updates', first.id, 'save', 'Edited SQLite title', 'Original heading\nTransactions are atomic.', rich)
    assert.equal(saved.note?.id, original.id)
    assert.equal(saved.note?.folderId, 'learning')
    assert.equal(saved.note?.createdAt, 1)
    assert.equal(notes.loadNotes().length, 1)
    assert.equal(setup.prepare('SELECT COUNT(*) AS count FROM note_revisions').get()?.count, 1)
    store.resolveProposal('updates', first.id, 'save', 'Should not overwrite', 'Different text')
    assert.equal(notes.loadNotes()[0].title, 'Edited SQLite title')
    store.close()
    store = new ChatStore(path)
    assert.deepEqual(store.loadMessages('updates')[1].proposal?.document, rich)
    assert.deepEqual(notes.loadNotes()[0].content, rich)
    const restored = store.resolveProposal('updates', first.id, 'undo')
    assert.deepEqual(restored.note, original)
    assert.deepEqual(notes.loadNotes(), [original])
    assert.equal(restored.message.proposal?.status, 'undone')
    assert.deepEqual(store.resolveProposal('updates', first.id, 'undo').note, original)
    assert.throws(() => store.resolveProposal('updates', first.id, 'save', 'Retry', 'Retry'), /undone/)

    const stale = propose('stale')
    notes.updateNote(original.id, { title: 'Changed in another browser' })
    assert.throws(() => store.resolveProposal('updates', stale.id, 'save', 'Stale title', 'Stale body'), /changed or was deleted/)
    assert.equal(notes.loadNotes()[0].title, 'Changed in another browser')
    assert.equal(store.loadMessages('updates').find((message) => message.id === stale.id)?.proposal?.status, 'pending')

    const later = propose('later')
    store.resolveProposal('updates', later.id, 'save', 'Approved update', 'Updated content')
    notes.updateNote(original.id, { content: textDocument('Later manual edit') })
    assert.throws(() => store.resolveProposal('updates', later.id, 'undo'), /overwrite later changes/)
    assert.equal(noteTextForTest(notes.loadNotes()[0].content), 'Later manual edit')

    const failed = propose('failed-update')
    const beforeFailure = notes.loadNotes()
    const revisionCount = setup.prepare('SELECT COUNT(*) AS count FROM note_revisions').get()?.count
    setup.exec("CREATE TRIGGER reject_update BEFORE UPDATE ON notes BEGIN SELECT RAISE(ABORT, 'simulated update failure'); END")
    assert.throws(() => store.resolveProposal('updates', failed.id, 'save', 'Cannot save', 'Failure'), /simulated update failure/)
    assert.deepEqual(notes.loadNotes(), beforeFailure)
    assert.equal(setup.prepare('SELECT COUNT(*) AS count FROM note_revisions').get()?.count, revisionCount)
    assert.equal(store.loadMessages('updates').find((message) => message.id === failed.id)?.proposal?.status, 'pending')
    setup.exec('DROP TRIGGER reject_update')

    const deleted = propose('deleted')
    notes.deleteNote(original.id)
    assert.throws(() => store.resolveProposal('updates', deleted.id, 'save', 'Resurrect', 'No'), /changed or was deleted/)
    assert.deepEqual(notes.loadNotes(), [])
  } finally { setup.close(); store.close(); notes.close(); await rm(directory, { recursive: true, force: true }) }
})

function noteTextForTest(content: import('../src/types/note.ts').Note['content']) {
  return content.content?.[0]?.content?.[0]?.text
}

test('failed approval rolls back both the note and proposal status and can be retried', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'knowledge-manager-approval-'))
  const path = join(directory, 'chat.sqlite')
  const notes = new NotesStore(path)
  const store = new ChatStore(path)
  const setup = new DatabaseSync(path)
  try {
    store.createConversation('approval')
    store.saveUserMessage('approval-user', 'Study data', 'approval', 'organize')
    const message = store.saveReply('approval-user', 'Review this draft', 'approval', { title: 'Study', content: 'Original text', status: 'pending' })
    setup.exec("CREATE TRIGGER fail_note BEFORE INSERT ON notes BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END")
    assert.throws(() => store.resolveProposal('approval', message.id, 'save', 'Edited title', 'Edited text'), /simulated write failure/)
    assert.deepEqual(notes.loadNotes(), [])
    assert.equal(store.loadMessages('approval')[1].proposal?.status, 'pending')
    setup.exec('DROP TRIGGER fail_note')
    const result = store.resolveProposal('approval', message.id, 'save', 'Edited title', 'Edited text')
    assert.equal(result.message.proposal?.status, 'saved')
    assert.equal(notes.loadNotes().length, 1)
    assert.equal(notes.loadNotes()[0].title, 'Edited title')
  } finally {
    setup.close(); store.close(); notes.close()
    await rm(directory, { recursive: true, force: true })
  }
})

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
