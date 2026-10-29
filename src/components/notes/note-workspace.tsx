import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NoteView } from '@/components/notes/note-view'
import { NoteAssistantPanel } from '@/components/notes/note-assistant-panel'
import type { Note } from '@/types/note'
import type { NoteAssistantProposal } from '@/types/chat'
import { NoteProposalCard } from '@/components/chat/note-proposal-card'
import { loadNoteEdits, resolvePanelEdit } from '@/lib/chat-api'

type Props = { note: Note; folderName?: string; ready: boolean; onContentChange: (id: string, content: Note['content']) => void; onRename: (id: string, title: string) => void; onSavedNote: (note: Note) => void }

export function NoteWorkspace({ note, folderName, ready, onContentChange, onRename, onSavedNote }: Props) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const toggle = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)
  const [edits, setEdits] = useState<NoteAssistantProposal[]>([])
  const [reviewId, setReviewId] = useState<string | null>(null)
  const [editsError, setEditsError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const editVersion = useRef(0)
  const review = edits.find((edit) => edit.id === reviewId)
  function includeEdit(edit: NoteAssistantProposal) {
    editVersion.current++
    setEdits((current) => [edit, ...current.filter((item) => item.id !== edit.id)])
  }
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const version = editVersion.current
    loadNoteEdits(note.id).then((saved) => {
      if (cancelled) return
      setEdits((current) => {
        const combined = new Map(current.map((edit) => [edit.id, edit]))
        for (const edit of saved) {
          if (version === editVersion.current || !combined.has(edit.id)) combined.set(edit.id, edit)
        }
        return [...combined.values()]
      })
      setEditsError('')
    }).catch(() => { if (!cancelled) setEditsError('Could not restore saved note updates.') })
    return () => { cancelled = true }
  }, [note.id, open, loadAttempt])
  function close() {
    restoreFocus.current = true
    setOpen(false)
  }
  useEffect(() => {
    if (!open && restoreFocus.current) {
      toggle.current?.focus({ preventScroll: true })
      restoreFocus.current = false
    }
  }, [open])
  return (
    <div className="@container flex min-h-0 flex-1 flex-col">
      {!open && createPortal(
        <Button ref={toggle} type="button" variant="outline" className="fixed top-3 right-3 z-30 size-12 rounded-full bg-background p-0 shadow-sm"
          aria-label="Ask about this note" title="Ask about this note" aria-expanded={false} aria-controls={id}
          onClick={() => setOpen(true)}><Sparkles className="size-5" aria-hidden="true" /></Button>,
        document.body,
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-3 @3xl:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-22 pb-6 sm:px-8 sm:pt-24 sm:pb-8">
            {review ? <>
              <Button type="button" variant="ghost" size="sm" onClick={() => setReviewId(null)}>Back to note</Button>
              <NoteProposalCard key={`${review.id}-${review.proposal.status}`} proposal={review.proposal} disabled={!ready} retryDisabled={!ready}
                onResolve={async (action, title, content, document) => {
                  const result = await resolvePanelEdit(note.id, review.id, action, title, content, document)
                  includeEdit(result.edit)
                  if (result.note) onSavedNote(result.note)
                  if (action === 'save' || action === 'discard') setReviewId(null)
                }}
                onRetry={async () => { const result = await resolvePanelEdit(note.id, review.id, 'reopen'); includeEdit(result.edit) }} />
            </> : <NoteView note={note} folderName={folderName} onContentChange={onContentChange} onRename={onRename} />}
          </div>
        </div>
        <aside id={id} hidden={!open} aria-label="Note assistant panel"
          className={open ? 'my-3 mr-3 min-h-0 min-w-0 flex-1 overflow-hidden rounded-3xl bg-background ring-1 ring-border ring-inset @3xl:w-[min(26rem,45%)] @3xl:flex-none' : 'hidden'}
          onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() } }}>
          <NoteAssistantPanel noteId={note.id} title={note.title} ready={ready} open={open} onClose={close}
            edits={edits} onEdit={(edit) => { includeEdit(edit); if (edit.proposal.status === 'pending') setReviewId(edit.id) }} onReview={setReviewId}
            onNoteChanged={(saved) => { onSavedNote(saved); setReviewId(null) }}
            editsError={editsError} onRetryEdits={() => setLoadAttempt((value) => value + 1)} />
        </aside>
      </div>
    </div>
  )
}
