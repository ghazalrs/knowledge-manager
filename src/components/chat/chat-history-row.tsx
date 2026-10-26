import { useRef, useState } from 'react'
import { MessageSquare, MoreHorizontal } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { Button } from '@/components/ui/button'
import type { Conversation } from '@/types/chat'

type ChatHistoryRowProps = {
  conversation: Conversation
  selected: boolean
  onSelect: (id: string) => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
}

export function ChatHistoryRow({ conversation, selected, onSelect, onRename, onDelete }: ChatHistoryRowProps) {
  const [renaming, setRenaming] = useState(false)
  const [draftTitle, setDraftTitle] = useState(conversation.title)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuTriggerRef = useRef<HTMLButtonElement>(null)

  function finishRename() {
    setRenaming(false)
    menuTriggerRef.current?.focus()
  }

  return (
    <li className={`flex min-w-0 items-center rounded-xl ${selected ? 'bg-secondary' : ''}`}>
      {renaming ? (
        <form
          className="min-w-0 flex-1 px-2"
          onSubmit={(event) => {
            event.preventDefault()
            const title = draftTitle.trim()
            if (!title) return
            onRename(conversation.id, title)
            finishRename()
          }}
        >
          <input
            ref={inputRef}
            autoFocus
            aria-label="Chat title (Enter to save, Escape to cancel)"
            required
            maxLength={80}
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
          className="h-9 min-w-0 flex-1 justify-start gap-3 rounded-xl font-normal"
          aria-current={selected ? 'page' : undefined}
          onClick={() => onSelect(conversation.id)}
        >
          <MessageSquare aria-hidden="true" />
          <span className="truncate">{conversation.title}</span>
        </Button>
      )}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button ref={menuTriggerRef} variant="ghost" size="icon" className="mr-1 text-muted-foreground" aria-label={`Options for ${conversation.title}`}>
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
              onSelect={() => { setDraftTitle(conversation.title); setRenaming(true) }}
            >
              Rename
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="cursor-default rounded-md px-3 py-2 text-sm text-destructive outline-none focus:bg-accent"
              onSelect={() => {
                if (window.confirm(`Delete “${conversation.title}” and all its messages? This cannot be undone.`)) onDelete(conversation.id)
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
