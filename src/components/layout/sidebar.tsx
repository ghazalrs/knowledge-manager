import { useId } from 'react'
import { FileText, Home, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Note } from '@/types/note'

type SidebarProps = {
  notes: Note[]
  selectedNoteId: string | null
  onHome: () => void
  onCreateNote: () => void
  onSelectNote: (id: string) => void
}

export function Sidebar({ notes, selectedNoteId, onHome, onCreateNote, onSelectNote }: SidebarProps) {
  const notesHeadingId = useId()

  return (
    <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-6 overflow-y-auto p-3">
      <div className="space-y-1">
        <Button
          variant={selectedNoteId === null ? 'secondary' : 'ghost'}
          className="h-10 w-full justify-start gap-3"
          aria-current={selectedNoteId === null ? 'page' : undefined}
          onClick={onHome}
        >
          <Home aria-hidden="true" />
          Home
        </Button>
        <Button variant="ghost" className="h-10 w-full justify-start gap-3" onClick={onCreateNote}>
          <Plus aria-hidden="true" />
          New note
        </Button>
      </div>
      <section aria-labelledby={notesHeadingId}>
        <h2 id={notesHeadingId} className="px-3 text-xs font-semibold text-muted-foreground">Notes</h2>
        {notes.length === 0 ? (
          <p className="mt-3 px-3 text-sm leading-relaxed text-muted-foreground">
            No notes yet. Create a note to get started.
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {notes.map((note) => (
              <li key={note.id}>
                <Button
                  variant={selectedNoteId === note.id ? 'secondary' : 'ghost'}
                  className="h-10 w-full justify-start gap-3"
                  aria-current={selectedNoteId === note.id ? 'page' : undefined}
                  onClick={() => onSelectNote(note.id)}
                >
                  <FileText aria-hidden="true" />
                  <span className="truncate">{note.title}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </nav>
  )
}
