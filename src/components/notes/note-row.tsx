import { useRef, useState } from 'react'
import { FileText, MoreHorizontal } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { Button } from '@/components/ui/button'
import type { Note } from '@/types/note'
import { NOTE_DRAG_TYPE } from '@/hooks/use-note-drop'

type NoteRowProps = {
  note: Note
  selected: boolean
  onSelect: (id: string) => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  onDragNote: (id: string | null) => void
}

export function NoteRow({ note, selected, onSelect, onRename, onDelete, onDragNote }: NoteRowProps) {
  const [renaming, setRenaming] = useState(false)
  const [draftTitle, setDraftTitle] = useState(note.title)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuTriggerRef = useRef<HTMLButtonElement>(null)

  function finishRename() {
    setRenaming(false)
    menuTriggerRef.current?.focus()
  }

  return (
    <li className={`flex min-w-0 items-center rounded-lg ${selected ? 'bg-secondary' : ''}`}>
      {renaming ? (
        <form
          className="min-w-0 flex-1 px-2"
          onSubmit={(event) => {
            event.preventDefault()
            const title = draftTitle.trim()
            if (!title) return
            onRename(note.id, title)
            finishRename()
          }}
        >
          <input
            ref={inputRef}
            autoFocus
            aria-label="Note title (Enter to save, Escape to cancel)"
            required
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
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
        <Button
          variant="ghost"
          className="h-10 min-w-0 flex-1 cursor-grab justify-start gap-3 active:cursor-grabbing"
          draggable
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData(NOTE_DRAG_TYPE, note.id)
            onDragNote(note.id)
          }}
          onDragEnd={() => onDragNote(null)}
          aria-current={selected ? 'page' : undefined}
          onClick={() => onSelect(note.id)}
        >
          <FileText aria-hidden="true" />
          <span className="truncate">{note.title}</span>
        </Button>
      )}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button ref={menuTriggerRef} variant="ghost" size="icon" className="mr-1" aria-label={`Options for ${note.title}`}>
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            className="z-60 min-w-36 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
            onCloseAutoFocus={(event) => {
              if (renaming) {
                event.preventDefault()
                inputRef.current?.focus()
                inputRef.current?.select()
              }
            }}
          >
            <DropdownMenu.Item
              className="cursor-default rounded-md px-3 py-2 text-sm outline-none focus:bg-accent"
              onSelect={() => { setDraftTitle(note.title); setRenaming(true) }}
            >
              Rename
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="cursor-default rounded-md px-3 py-2 text-sm text-destructive outline-none focus:bg-accent"
              onSelect={() => {
                if (window.confirm(`Delete “${note.title}”? This cannot be undone.`)) onDelete(note.id)
              }}
            >
              Delete
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </li>
  )
}
