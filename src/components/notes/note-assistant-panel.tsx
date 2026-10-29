import { useEffect, useId, useRef, useState } from 'react'
import { ArrowUp, FileText, Lightbulb, ListChecks, LoaderCircle, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { askAboutNote } from '@/lib/chat-api'
import type { ChatTextMessage, NoteAssistantProposal } from '@/types/chat'
import type { Note } from '@/types/note'

type Props = { noteId: string; title: string; ready: boolean; open: boolean; onClose: () => void;
  edits: NoteAssistantProposal[]; onEdit: (edit: NoteAssistantProposal) => void; onReview: (id: string) => void;
  editsError: string; onRetryEdits: () => void; onNoteChanged: (note: Note) => void }

export function NoteAssistantPanel({ noteId, title, ready, open, onClose, edits, onEdit, onReview, editsError, onRetryEdits, onNoteChanged }: Props) {
  const [messages, setMessages] = useState<ChatTextMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [pending, setPending] = useState<ChatTextMessage[] | null>(null)
  const [error, setError] = useState('')
  const running = useRef(false)
  const requestId = useRef<string | null>(null)
  const list = useRef<HTMLDivElement>(null)
  const inputId = useId()
  const textarea = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { if (open) textarea.current?.focus({ preventScroll: true }) }, [open])
  useEffect(() => {
    if (!textarea.current) return
    textarea.current.style.height = 'auto'
    textarea.current.style.height = `${Math.min(textarea.current.scrollHeight, 144)}px`
  }, [draft, open])

  useEffect(() => {
    if (list.current) list.current.scrollTop = messages.length || sending ? list.current.scrollHeight : 0
  }, [messages.length, sending, open])

  async function request(history: ChatTextMessage[]) {
    if (running.current || !ready) return
    running.current = true
    setSending(true)
    setError('')
    setPending(history)
    try {
      const context = history.slice(-19).map((message) => ({ ...message, content: message.content.slice(0, 10000) }))
      while (context.length > 1 && context.reduce((sum, message) => sum + message.content.length, 0) > 50000) context.splice(0, 2)
      requestId.current ??= crypto.randomUUID()
      const response = await askAboutNote(noteId, context, requestId.current)
      setMessages([...history, { role: 'assistant', content: response.content }])
      if (response.edit) onEdit(response.edit)
      if (response.note) onNoteChanged(response.note)
      requestId.current = null
      setPending(null)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not get an answer. Please retry.') }
    finally { running.current = false; setSending(false) }
  }

  function send(content = draft.trim()) {
    if (!content || !ready || running.current || pending) return
    const history: ChatTextMessage[] = [...messages, { role: 'user', content }]
    setMessages(history)
    setDraft('')
    void request(history)
  }

  return (
    <section aria-label={`Note assistant for ${title}`} className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between px-3 pt-3">
        <Button type="button" variant="secondary" size="icon" className="size-12 rounded-full" aria-label="Focus note assistant question"
          title="Ask about this note" onClick={() => textarea.current?.focus({ preventScroll: true })}><Sparkles className="size-5" aria-hidden="true" /></Button>
        <Button type="button" variant="ghost" size="icon" className="size-12 rounded-full" aria-label="Close note assistant" title="Close note assistant" onClick={onClose}><X aria-hidden="true" /></Button>
      </div>
      <div ref={list} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
        {!messages.length && <div className="flex min-h-full flex-col gap-8 py-5">
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <h3 className="text-xl font-medium tracking-tight">Explore this note</h3>
            <p className="mt-2 max-w-64 text-sm leading-6 text-muted-foreground">Ask a question or request an edit. Review changes before saving.</p>
          </div>
          <div className="space-y-2">
            {[
              { label: 'Summarize this note', prompt: 'Summarize this note.', icon: FileText },
              { label: 'Explain the main ideas', prompt: 'Explain the main ideas in this note in simple terms.', icon: Lightbulb },
              { label: 'What are the key takeaways?', prompt: 'What are the key takeaways from this note?', icon: ListChecks },
              { label: 'Improve the writing', prompt: 'Propose an edit to improve the clarity and organization of this note while preserving its facts.', icon: FileText },
            ].map(({ label, prompt, icon: Icon }) => <Button key={label} type="button" variant="outline"
              className="h-auto min-h-10 w-full justify-start gap-3 rounded-2xl px-4 py-2 text-left text-sm font-normal whitespace-normal"
              disabled={!ready} onClick={() => send(prompt)}><Icon className="size-4 text-muted-foreground" aria-hidden="true" />{label}</Button>)}
          </div>
        </div>}
        <ol role="log" aria-label="Note assistant messages" aria-live="polite" aria-relevant="additions" className="space-y-5">
          {messages.map((message, index) => <li key={index} className={`w-fit max-w-full whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere] ${message.role === 'user' ? 'ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-muted px-4 py-3' : 'py-1'}`}>
            <span className="sr-only">{message.role === 'user' ? 'You: ' : 'Assistant: '}</span>{message.content}
          </li>)}
        </ol>
        {sending && <p role="status" className="flex items-center gap-2 py-3 text-xs text-muted-foreground"><LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" />Thinking…</p>}
        {edits.length > 0 && <details className="mt-5 text-sm" open={!messages.length}>
          <summary className="cursor-pointer text-muted-foreground">Note updates ({edits.length})</summary>
          <ul className="mt-2 space-y-2">{edits.map((edit) => <li key={edit.id}>
            <Button type="button" variant="outline" className="h-auto w-full flex-col items-start gap-1 rounded-xl px-3 py-2 text-left whitespace-normal" onClick={() => onReview(edit.id)}>
              <span className="break-words">{edit.proposal.title || 'Untitled'}</span><span className="text-xs font-normal text-muted-foreground">{edit.proposal.status === 'pending' ? 'Review update' : edit.proposal.status === 'saved' ? 'Saved · Undo available' : edit.proposal.status === 'discarded' ? 'Discarded · Try again available' : 'Update undone'}</span>
            </Button>
          </li>)}</ul>
        </details>}
        {editsError && <div role="alert" className="mt-3 text-sm text-destructive"><p>{editsError}</p><Button type="button" variant="outline" size="sm" onClick={onRetryEdits}>Retry updates</Button></div>}
      </div>
      <div className="shrink-0 space-y-2 px-4 pb-4 pt-3">
        {error && <div role="alert" className="text-sm text-destructive"><p>{error}</p><Button type="button" variant="outline" size="sm" className="mt-2" disabled={sending || !ready} onClick={() => { if (pending) void request(pending) }}>Retry</Button></div>}
        {!ready && <p role="status" className="text-xs text-muted-foreground">Waiting for the note to save. Resolve any save error before asking.</p>}
        <form className="flex items-end gap-2 rounded-3xl bg-muted/70 p-2 focus-within:ring-2 focus-within:ring-ring" onSubmit={(event) => { event.preventDefault(); send() }}>
          <label htmlFor={inputId} className="sr-only">Question about this note</label>
          <textarea ref={textarea} id={inputId} rows={1} maxLength={10000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask about this note…"
            className="block max-h-36 min-h-9 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-2 py-1.5 text-sm leading-6 outline-none"
            onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} />
          <Button type="submit" size="icon-lg" className="rounded-full" aria-label="Send question" disabled={!ready || sending || !!pending || !draft.trim()}><ArrowUp aria-hidden="true" /></Button>
        </form>
      </div>
    </section>
  )
}
