import { useId, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Folder as FolderIcon, MoreHorizontal } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { Button } from '@/components/ui/button'
import type { Folder } from '@/types/folder'
import type { Note } from '@/types/note'
import { NoteRow } from '@/components/notes/note-row'
import { useNoteDrop } from '@/hooks/use-note-drop'

type FolderRowProps = {
  folder: Folder
  notes: Note[]
  selectedNoteId: string | null
  onCreateNote: (folderId: string) => void
  onSelectNote: (id: string) => void
  onRenameNote: (id: string, title: string) => void
  onDeleteNote: (id: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  draggedNote: Note | undefined
  onDragNote: (id: string | null) => void
  onMoveNote: (id: string, folderId: string | null) => void
}

export function FolderRow({ folder, notes, selectedNoteId, onCreateNote, onSelectNote, onRenameNote, onDeleteNote, onRename, onDelete, draggedNote, onDragNote, onMoveNote }: FolderRowProps) {
  const [expanded, setExpanded] = useState(true)
  const contentsId = useId()
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(folder.name)
  const inputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const { isOver, dropProps } = useNoteDrop(folder.id, draggedNote, (id, folderId) => {
    onMoveNote(id, folderId)
    setExpanded(true)
  }, () => onDragNote(null))

  function finishRename() {
    setRenaming(false)
    triggerRef.current?.focus()
  }

  return (
    <li {...dropProps} className={`min-w-0 rounded-lg ${isOver ? 'bg-accent ring-2 ring-ring' : ''}`}>
      <div className="flex min-w-0 items-center rounded-lg">
      {renaming ? (
        <form className="min-w-0 flex-1 px-2" onSubmit={(event) => {
          event.preventDefault()
          const name = draftName.trim()
          if (!name) return
          onRename(folder.id, name)
          finishRename()
        }}>
          <input
            ref={inputRef}
            autoFocus
            required
            aria-label="Folder name (Enter to save, Escape to cancel)"
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onBlur={() => setRenaming(false)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                finishRename()
              }
            }}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </form>
      ) : (
        <Button variant="ghost" className="h-10 min-w-0 flex-1 justify-start gap-2"
          aria-expanded={expanded} aria-controls={contentsId} onClick={() => setExpanded((value) => !value)}>
          {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
          <FolderIcon aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">{folder.name}</span>
        </Button>
      )}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button ref={triggerRef} variant="ghost" size="icon" className="mr-1" aria-label={`Folder options for ${folder.name}`}>
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={4}
            className="z-60 min-w-36 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
            onCloseAutoFocus={(event) => {
              if (renaming) {
                event.preventDefault()
                inputRef.current?.focus()
                inputRef.current?.select()
              }
            }}>
            <DropdownMenu.Item className="cursor-default rounded-md px-3 py-2 text-sm outline-none focus:bg-accent"
              onSelect={() => { setExpanded(true); onCreateNote(folder.id) }}>
              New note
            </DropdownMenu.Item>
            <DropdownMenu.Item className="cursor-default rounded-md px-3 py-2 text-sm outline-none focus:bg-accent"
              onSelect={() => { setDraftName(folder.name); setRenaming(true) }}>
              Rename
            </DropdownMenu.Item>
            <DropdownMenu.Item className="cursor-default rounded-md px-3 py-2 text-sm text-destructive outline-none focus:bg-accent"
              onSelect={() => {
                if (window.confirm(`Delete folder “${folder.name}” and all notes inside it? This cannot be undone.`)) onDelete(folder.id)
              }}>
              Delete
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      </div>
      <div id={contentsId} hidden={!expanded} className="ml-5">
        {notes.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">No notes in this folder.</p>
        ) : (
          <ul className="space-y-1">
            {notes.map((note) => (
              <NoteRow key={note.id} note={note} selected={selectedNoteId === note.id}
                onSelect={onSelectNote} onRename={onRenameNote} onDelete={onDeleteNote} onDragNote={onDragNote} />
            ))}
          </ul>
        )}
      </div>
    </li>
  )
}
