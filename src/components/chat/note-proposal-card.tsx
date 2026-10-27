import { useId, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NoteEditor } from '@/components/notes/note-editor'
import type { NoteProposal, ProposalAction } from '@/types/chat'
import type { Note } from '@/types/note'
import { noteText, textDocument } from '@/lib/note-text'

type Props = {
  proposal: NoteProposal
  disabled: boolean
  retryDisabled: boolean
  onRetry: () => Promise<void>
  onResolve: (action: ProposalAction, title?: string, content?: string, document?: Note['content']) => Promise<void>
}

export function NoteProposalCard({ proposal, disabled, retryDisabled, onRetry, onResolve }: Props) {
  const id = useId()
  const [title, setTitle] = useState(proposal.title)
  const [document, setDocument] = useState<Note['content']>(() => proposal.document ?? textDocument(proposal.content))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = proposal.status === 'pending'
  const updating = proposal.action === 'update'
  const comparing = updating && !!proposal.originalNote
  const savedDocument = proposal.document ?? textDocument(proposal.content)
  const heading = pending ? updating ? 'Review note update' : 'Review new note'
    : proposal.status === 'saved' ? updating ? 'Note updated' : 'Note saved'
      : proposal.status === 'undone' ? 'Update undone' : 'Proposal discarded'

  async function resolve(action: ProposalAction) {
    setBusy(true)
    setError('')
    try { await onResolve(action, title.trim(), noteText(document), action === 'save' || action === 'discard' ? document : undefined) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not update this proposal. Please retry.') }
    finally { setBusy(false) }
  }

  async function retry() {
    setBusy(true)
    setError('')
    try { await onRetry() }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not start another attempt. Please retry.') }
    finally { setBusy(false) }
  }

  return (
    <section aria-label="Proposed note" aria-describedby={`${id}-comparison`} className="@container mt-4 overflow-hidden rounded-2xl border bg-background">
      <div className="space-y-2 border-b bg-muted/30 px-5 py-4">
        {updating ? <p className="text-sm text-muted-foreground">{pending ? 'Compare the versions and edit the proposed note before saving.' : heading}</p> : <>
        <h3 className="text-sm font-medium">{heading}</h3>
        <p className="text-xs text-muted-foreground">{pending ? updating
          ? 'Compare the versions and edit the proposed note before saving. Its folder stays the same.'
          : 'Edit the note before saving it at the top level.'
          : proposal.status === 'saved' ? updating ? 'Your previous version is preserved for undo.' : 'Added to your notes.'
            : proposal.status === 'undone' ? 'The original version was restored.' : 'Your notes were not changed.'}</p>
        {proposal.reason && <p className="text-sm text-muted-foreground">{proposal.reason}</p>}
        {!!proposal.relatedNotes?.length && <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Related notes considered ({proposal.relatedNotes.length})</summary>
          <ul className="mt-2 list-disc pl-5">{proposal.relatedNotes.map((note) => <li key={note.id}>{note.title}</li>)}</ul>
        </details>}
        </>}
      </div>
      <div className={comparing ? 'grid @3xl:grid-cols-2' : ''}>
        {comparing && <section aria-label="Original note" className="min-w-0 border-b @3xl:border-r @3xl:border-b-0">
          <div className="flex h-10 items-center justify-between gap-2 border-b bg-rose-50/70 px-5 text-xs text-muted-foreground dark:bg-rose-950/20">
            <span className="font-medium text-foreground">Original</span><span>Read-only</span>
          </div>
          <div className="p-5 text-base sm:p-6">
            <h4 className="break-words text-2xl font-medium tracking-tight [overflow-wrap:anywhere] sm:text-3xl">{proposal.originalNote!.title}</h4>
            <NoteEditor content={proposal.originalNote!.content} editable={false} label="Original note content" />
          </div>
        </section>}
        <section aria-label={updating ? 'Proposed updated note' : 'Proposed new note'} className="min-w-0">
          <div className="flex h-10 items-center justify-between gap-2 border-b bg-emerald-50/70 px-5 text-xs text-muted-foreground dark:bg-emerald-950/20">
            <span className="flex items-center gap-2 font-medium text-foreground">{comparing && <ArrowRight className="size-3.5" aria-hidden="true" />}{updating ? 'Proposed update' : 'New note'}</span>
            <span>{pending ? 'Editable' : 'Reviewed version'}</span>
          </div>
          <div className="p-5 text-base sm:p-6">
            {pending ? <input aria-label="Proposed note title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200}
              disabled={busy} className="block w-full min-w-0 bg-transparent text-2xl font-medium tracking-tight outline-none focus-visible:underline sm:text-3xl" />
              : <h4 className="break-words text-2xl font-medium tracking-tight [overflow-wrap:anywhere] sm:text-3xl">{proposal.title}</h4>}
            <NoteEditor key={pending ? 'draft' : 'reviewed'} content={pending ? document : savedDocument}
              onChange={setDocument} editable={pending && !busy} label="Proposed note content" />
          </div>
        </section>
      </div>
      <div className="space-y-2 border-t bg-muted/20 px-5 py-4">
        {pending && <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy || disabled || !title.trim() || !noteText(document).trim()}
            onClick={() => { void resolve('save') }}>{busy ? 'Saving…' : updating ? 'Save update' : 'Save note'}</Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => { void resolve('discard') }}>Discard</Button>
        </div>}
        {proposal.status === 'saved' && updating && <Button type="button" variant="outline" disabled={busy || disabled}
          onClick={() => { void resolve('undo') }}>{busy ? 'Restoring…' : 'Undo update'}</Button>}
        {proposal.status === 'discarded' && <Button type="button" variant="outline" disabled={busy || retryDisabled}
          onClick={() => { void retry() }}>{busy ? 'Trying again…' : 'Try again'}</Button>}
        {proposal.status === 'undone' && <p className="text-xs text-muted-foreground">{heading}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <span id={`${id}-comparison`} className="sr-only">{comparing ? 'Original note on the left; proposed version on the right. Versions stack on smaller screens.' : 'Review the proposed note before saving.'}</span>
      </div>
    </section>
  )
}
