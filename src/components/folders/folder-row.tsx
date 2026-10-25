import { useRef, useState } from 'react'
import { Folder as FolderIcon, MoreHorizontal } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { Button } from '@/components/ui/button'
import type { Folder } from '@/types/folder'

type FolderRowProps = {
  folder: Folder
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}

export function FolderRow({ folder, onRename, onDelete }: FolderRowProps) {
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(folder.name)
  const inputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  function finishRename() {
    setRenaming(false)
    triggerRef.current?.focus()
  }

  return (
    <li className="flex min-w-0 items-center rounded-lg">
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
        <div className="flex h-10 min-w-0 flex-1 items-center gap-3 px-2.5 text-sm">
          <FolderIcon aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">{folder.name}</span>
        </div>
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
              onSelect={() => { setDraftName(folder.name); setRenaming(true) }}>
              Rename
            </DropdownMenu.Item>
            <DropdownMenu.Item className="cursor-default rounded-md px-3 py-2 text-sm text-destructive outline-none focus:bg-accent"
              onSelect={() => {
                if (window.confirm(`Delete folder “${folder.name}”? This cannot be undone.`)) onDelete(folder.id)
              }}>
              Delete
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </li>
  )
}
