import { useEffect, useRef, useState } from 'react'
import type { Note } from '@/types/note'
import { NoteEditor } from '@/components/notes/note-editor'

type NoteViewProps = {
  note: Note
  folderName?: string
  onContentChange: (id: string, content: Note['content']) => void
  onRename: (id: string, title: string) => void
}

export function NoteView({ note, folderName, onContentChange, onRename }: NoteViewProps) {
  const [renaming, setRenaming] = useState(false)
  const [draftTitle, setDraftTitle] = useState(note.title)
  const titleButton = useRef<HTMLButtonElement>(null)
  const editing = useRef(false)
  const returnFocus = useRef(false)

  useEffect(() => {
    if (!renaming && returnFocus.current) {
      titleButton.current?.focus()
      returnFocus.current = false
    }
  }, [renaming])

  function finishRename(focusTitle: boolean) {
    editing.current = false
    returnFocus.current = focusTitle
    setRenaming(false)
  }

  function saveTitle(focusTitle: boolean) {
    if (!editing.current) return
    const title = draftTitle.trim() || 'Untitled'
    if (title !== note.title) onRename(note.id, title)
    finishRename(focusTitle)
  }

  return (
    <section className="mx-auto w-full max-w-3xl" aria-labelledby="note-title">
      {note.folderId !== null && folderName && (
        <p className="mb-3 break-words text-sm text-muted-foreground">{folderName}</p>
      )}
      <h1 id="note-title" className="break-words text-2xl font-medium tracking-tight sm:text-3xl">
        {renaming ? (
          <input
            autoFocus
            aria-label="Note title (Enter to save, Escape to cancel)"
            value={draftTitle}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setDraftTitle(event.target.value)}
            onBlur={() => saveTitle(false)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return
              if (event.key === 'Enter') { event.preventDefault(); saveTitle(true) }
              if (event.key === 'Escape') { event.preventDefault(); finishRename(true) }
            }}
            className="w-full min-w-0 bg-transparent text-inherit font-inherit tracking-inherit outline-none"
          />
        ) : (
          <button
            ref={titleButton}
            type="button"
            aria-label={`Rename note title: ${note.title}`}
            title="Click to rename"
            className="w-full cursor-text text-left break-words outline-none focus-visible:underline"
            onClick={() => {
              setDraftTitle(note.title)
              editing.current = true
              setRenaming(true)
            }}
          >
            {note.title}
          </button>
        )}
      </h1>
      <NoteEditor content={note.content} onChange={(content) => onContentChange(note.id, content)} />
    </section>
  )
}
