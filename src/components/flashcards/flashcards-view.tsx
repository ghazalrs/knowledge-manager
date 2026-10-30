import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Note } from '@/types/note'
import type { Flashcard, FlashcardDraft } from '@/types/flashcard'

type Props = { notes: Note[]; ready: boolean; onOpenNote: (id: string) => void }

async function call<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/flashcards${path}`, { method, cache: 'no-store', signal,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(typeof data?.error === 'string' ? data.error : 'Could not access flashcards. Please retry.')
  }
  return response.status === 204 ? undefined as T : response.json()
}

export default function FlashcardsView({ notes, ready, onOpenNote }: Props) {
  const [cards, setCards] = useState<Flashcard[]>([])
  const [noteId, setNoteId] = useState('')
  const [draft, setDraft] = useState<FlashcardDraft | null>(null)
  const [queue, setQueue] = useState<string[] | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null)
  const locked = useRef(false)
  const current = queue?.length ? cards.find((card) => card.id === queue[0]) : undefined

  useEffect(() => {
    const abort = new AbortController()
    call<Flashcard[]>('', 'GET', undefined, abort.signal).then(setCards).catch((e: Error) => { if (!abort.signal.aborted) setError(e.message) }).finally(() => { if (!abort.signal.aborted) setLoading(false) })
    return () => { abort.abort(); controller.current?.abort() }
  }, [])

  async function run(action: (signal: AbortSignal) => Promise<void>) {
    if (locked.current) return
    locked.current = true
    setBusy(true); setError('')
    const abort = new AbortController()
    controller.current = abort
    try { await action(abort.signal) } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'Please retry.') }
    finally { locked.current = false; if (!abort.signal.aborted) setBusy(false) }
  }
  function generate() {
    void run(async (signal) => { setDraft(await call<FlashcardDraft>('/generate', 'POST', { noteId }, signal)) })
  }
  function save() {
    if (!draft) return
    void run(async (signal) => {
      const result = await call<Flashcard[]>('', 'POST', { noteId: draft.noteId, sourceFingerprint: draft.sourceFingerprint, cards: draft.cards }, signal)
      setCards(result); setDraft(null)
    })
  }
  function rate(rating: 'again' | 'got-it') {
    if (!current || !queue) return
    void run(async (signal) => {
      await call(`/${current.id}`, 'PATCH', { rating }, signal)
      setCards((items) => items.map((card) => card.id === current.id ? { ...card, reviewCount: card.reviewCount + 1, lastRating: rating, lastReviewedAt: Date.now() } : card))
      setQueue(rating === 'again' ? [...queue.slice(1), current.id] : queue.slice(1)); setRevealed(false)
    })
  }
  return <section className="mx-auto w-full max-w-3xl space-y-8" aria-label="Flashcards">
    <div><h1 className="text-2xl font-medium tracking-tight">Flashcards</h1><p className="mt-2 text-sm text-muted-foreground">Create cards from your notes and review what you’ve learned.</p></div>
    {error && <p role="alert" className="rounded-xl bg-muted p-3 text-sm text-destructive">{error} {loading ? 'Reopen Flashcards to retry.' : ''}</p>}
    <div className="space-y-3 rounded-2xl border p-5">
      <h2 className="font-medium">Generate from a note</h2>
      <label className="block text-sm" htmlFor="flashcard-note">Choose a saved note</label>
      <select id="flashcard-note" value={noteId} onChange={(event) => setNoteId(event.target.value)} disabled={busy || !!draft} className="w-full rounded-lg border bg-background p-2 text-sm">
        <option value="">Select a note</option>{notes.map((note) => <option key={note.id} value={note.id}>{note.title}</option>)}
      </select>
      <p className="text-xs text-muted-foreground">Generating sends the selected note’s text to OpenAI and may incur API charges. Review the results for accuracy before saving.</p>
      {!ready && <p role="status" className="text-xs text-muted-foreground">Waiting for saved notes…</p>}
      {!draft && <Button onClick={generate} disabled={!ready || !noteId || busy}>{busy ? 'Generating…' : 'Generate cards'}</Button>}
      {draft && <div className="space-y-4"><p className="text-sm">Edit or remove cards before saving.</p>
        {draft.cards.map((card, index) => <div key={index} className="space-y-2 rounded-xl bg-muted/50 p-4">
          <label className="block text-xs font-medium">Question {index + 1}<textarea value={card.question} maxLength={500} rows={2} onChange={(event) => setDraft({ ...draft, cards: draft.cards.map ( (item, i) => i === index ? { ...item, question: event.target.value } : item) })} className="mt-1 w-full rounded-lg border bg-background p-2 text-sm" /></label>
          <label className="block text-xs font-medium">Answer<textarea value={card.answer} maxLength={2000} rows={3} onChange={(event) => setDraft({ ...draft, cards: draft.cards.map((item, i) => i === index ? { ...item, answer: event.target.value } : item) })} className="mt-1 w-full rounded-lg border bg-background p-2 text-sm" /></label>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setDraft({ ...draft, cards: draft.cards.filter((_, i) => i !== index) })}>Remove card</Button>
        </div>)}
        <div className="flex flex-wrap gap-2"><Button onClick={save} disabled={!ready || busy || !draft.cards.length || draft.cards.some((card) => !card.question.trim() || !card.answer.trim())}>Save cards</Button><Button variant="outline" disabled={busy} onClick={() => setDraft(null)}>Discard preview</Button></div>
      </div>}
    </div>
    <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-medium">Review cards</h2>{queue === null && <Button variant="outline" disabled={loading || busy || !cards.length} onClick={() => { setQueue(cards.map((card) => card.id)); setRevealed(false) }}>Start review</Button>}</div>
      {loading ? <p role="status" className="text-sm text-muted-foreground">Loading cards…</p> : queue !== null ? <div className="space-y-4 rounded-2xl border p-5">
        {current ? <><p className="text-xs text-muted-foreground">{queue.length} remaining</p><p className="whitespace-pre-wrap text-lg">{current.question}</p>{revealed ? <><p className="whitespace-pre-wrap rounded-xl bg-muted p-4 text-sm">{current.answer}</p><div className="flex gap-2"><Button variant="outline" disabled={busy} onClick={() => rate('again')}>Again</Button><Button disabled={busy} onClick={() => rate('got-it')}>Got it</Button></div></> : <Button onClick={() => setRevealed(true)}>Reveal answer</Button>}</> : <p className="text-sm">Review complete.</p>}
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setQueue(null)}>End review</Button>
      </div> : !cards.length ? <p className="text-sm text-muted-foreground">No saved cards yet.</p> : <ul className="space-y-2">{cards.map((card) => <li key={card.id} className="rounded-xl border p-4"><p className="whitespace-pre-wrap text-sm font-medium">{card.question}</p><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{card.answer}</p><div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">{card.noteId && notes.some((note) => note.id === card.noteId) ? <button className="underline" onClick={() => onOpenNote(card.noteId!)}>{card.sourceTitle}</button> : <span>{card.sourceTitle} (note deleted)</span>}<span>Reviewed {card.reviewCount} times</span><Button size="sm" variant="ghost" disabled={busy} onClick={() => { if (window.confirm('Delete this flashcard?')) void run(async (signal) => { await call(`/${card.id}`, 'DELETE', undefined, signal); setCards((items) => items.filter((item) => item.id !== card.id)) }) }}>Delete</Button></div></li>)}</ul>}
    </div>
  </section>
}
