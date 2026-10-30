import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NotesStore } from '../server/notes-store.ts'
import { FlashcardStore } from '../server/flashcard-store.ts'
import { createFlashcardGenerator, validateCards } from '../server/flashcard-generation.ts'
import { textDocument } from '../src/lib/note-text.ts'

const cards = [{ question: 'What supports memory?', answer: 'Sleep supports memory.' }]
const note = { id: 'note', title: 'Sleep', content: textDocument('Sleep supports memory.'), folderId: null, createdAt: 1 }

test('approved cards persist, retries deduplicate, reviews persist, and deleted sources preserve cards', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'flashcards-'))
  const path = join(directory, 'test.sqlite')
  const notes = new NotesStore(path)
  let store = new FlashcardStore(path, () => notes.loadNotes())
  try {
    notes.createNote(note)
    const draft = await store.generate('note', async () => cards, new AbortController().signal)
    assert.deepEqual(store.list(), [])
    store.save(draft.noteId, draft.sourceFingerprint, cards)
    store.save(draft.noteId, draft.sourceFingerprint, cards)
    assert.equal(store.list().length, 1)
    const id = store.list()[0].id
    store.review(id, 'again')
    store.review(id, 'got-it')
    store.close()
    store = new FlashcardStore(path, () => notes.loadNotes())
    assert.equal(store.list()[0].reviewCount, 2)
    assert.equal(store.list()[0].lastRating, 'got-it')
    assert.deepEqual(notes.loadNotes(), [note])
    notes.updateNote('note', { title: 'Updated' })
    assert.throws(() => store.save('note', draft.sourceFingerprint, cards), /changed/)
    notes.deleteNote('note')
    assert.equal(store.list()[0].noteId, null)
    assert.equal(store.list()[0].sourceTitle, 'Sleep')
    store.delete(id)
    assert.deepEqual(store.list(), [])
  } finally { store.close(); notes.close(); await rm(directory, { recursive: true }) }
})

test('generation rejects concurrent note changes, cancellation, empty and oversized notes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'flashcards-stale-'))
  const notes = new NotesStore(join(directory, 'test.sqlite'))
  const store = new FlashcardStore(join(directory, 'test.sqlite'), () => notes.loadNotes())
  try {
    notes.createNote(note)
    await assert.rejects(store.generate('note', async () => { notes.updateNote('note', { title: 'Changed' }); return cards }, new AbortController().signal), /changed/)
    const controller = new AbortController()
    await assert.rejects(store.generate('note', async () => { controller.abort(); return cards }, controller.signal))
    assert.deepEqual(store.list(), [])
    const generate = createFlashcardGenerator({ model: 'test' })
    await assert.rejects(generate({ ...note, content: textDocument('') }, new AbortController().signal), /no text/)
    await assert.rejects(generate({ ...note, content: textDocument('x'.repeat(30001)) }, new AbortController().signal), /30,000/)
  } finally { store.close(); notes.close(); await rm(directory, { recursive: true }) }
})

test('generation uses structured responses and validates bounded, distinct cards', async () => {
  const generate = createFlashcardGenerator({ model: 'test', apiKey: 'test', fetcher: async (_url, init) => {
    const body = JSON.parse(init?.body as string)
    assert.equal(body.store, false)
    assert.equal(body.text.format.name, 'flashcards')
    assert.match(body.instructions, /untrusted reference data/)
    return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ cards }) }] }] })
  } })
  assert.deepEqual(await generate(note, new AbortController().signal), cards)
  for (const invalid of [[], [...cards, ...cards], [{ question: '', answer: 'a' }], [{ question: 'q', answer: 'a'.repeat(2001) }], [{ ...cards[0], extra: 'bad' }]]) {
    assert.throws(() => validateCards(invalid))
  }
  await assert.rejects(createFlashcardGenerator({ model: 'test' })(note, new AbortController().signal), /OPENAI_API_KEY/)
})
