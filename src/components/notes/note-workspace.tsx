import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NoteView } from '@/components/notes/note-view'
import { NoteAssistantPanel } from '@/components/notes/note-assistant-panel'
import type { Note } from '@/types/note'

type Props = { note: Note; folderName?: string; ready: boolean; onContentChange: (id: string, content: Note['content']) => void; onRename: (id: string, title: string) => void }

export function NoteWorkspace({ note, folderName, ready, onContentChange, onRename }: Props) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const toggle = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)
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
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6 sm:px-8 sm:py-8">
            <NoteView note={note} folderName={folderName} onContentChange={onContentChange} onRename={onRename} />
          </div>
        </div>
        <aside id={id} hidden={!open} aria-label="Note assistant panel"
          className={open ? 'min-h-0 min-w-0 flex-1 overflow-hidden rounded-3xl border bg-background @3xl:w-[min(26rem,45%)] @3xl:flex-none' : 'hidden'}
          onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() } }}>
          <NoteAssistantPanel noteId={note.id} title={note.title} ready={ready} open={open} onClose={close} />
        </aside>
      </div>
    </div>
  )
}
