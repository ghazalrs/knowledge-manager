import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { NoteProposal } from '@/types/chat'

type Props = {
  proposal: NoteProposal
  disabled: boolean
  onResolve: (action: 'save' | 'discard', title?: string, content?: string) => Promise<void>
}

export function NoteProposalCard({ proposal, disabled, onResolve }: Props) {
  const id = useId()
  const [title, setTitle] = useState(proposal.title)
  const [content, setContent] = useState(proposal.content)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = proposal.status === 'pending'

  async function resolve(action: 'save' | 'discard') {
    setBusy(true)
    setError('')
    try { await onResolve(action, title.trim(), content.trim()) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not update this proposal. Please retry.') }
    finally { setBusy(false) }
  }

  return (
    <section aria-label="Proposed note" className="mt-3 space-y-3 rounded-2xl border bg-muted/25 p-4">
      <div>
        <h3 className="text-sm font-medium">{pending ? 'Proposed new note' : proposal.status === 'saved' ? 'Note saved' : 'Proposal discarded'}</h3>
        <p className="text-xs text-muted-foreground">{pending ? 'Review and edit before saving. The note will be created at the top level.' : proposal.status === 'saved' ? 'Added to your notes.' : 'No note was created.'}</p>
      </div>
      {pending ? (
        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (!busy && !disabled) void resolve('save') }}>
          <div>
            <label htmlFor={`${id}-title`} className="text-xs font-medium">Title</label>
            <input id={`${id}-title`} value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={200}
              disabled={busy} className="mt-1 block w-full rounded-lg border bg-background px-3 py-2 text-sm" />
          </div>
          <div>
            <label htmlFor={`${id}-content`} className="text-xs font-medium">Note text</label>
            <textarea id={`${id}-content`} value={content} onChange={(event) => setContent(event.target.value)} required maxLength={50000}
              disabled={busy} rows={8} className="mt-1 block max-h-96 min-h-40 w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm leading-6" />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || disabled || !title.trim() || !content.trim()}>{busy ? 'Updating…' : 'Save note'}</Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => { void resolve('discard') }}>Discard</Button>
          </div>
        </form>
      ) : (
        <div>
          <p className="font-medium">{proposal.title}</p>
          <p className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{proposal.content}</p>
        </div>
      )}
    </section>
  )
}
