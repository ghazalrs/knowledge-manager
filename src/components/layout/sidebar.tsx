import { useId } from 'react'
import { Home, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NoteRow } from '@/components/notes/note-row'
import type { Note } from '@/types/note'

type SidebarProps = {
  notes: Note[]
  loading: boolean
  loadError: boolean
  selectedNoteId: string | null
  onHome: () => void
  onCreateNote: () => void
  onSelectNote: (id: string) => void
  onRenameNote: (id: string, title: string) => void
  onDeleteNote: (id: string) => void
}

export function Sidebar({ notes, loading, loadError, selectedNoteId, onHome, onCreateNote, onSelectNote, onRenameNote, onDeleteNote }: SidebarProps) {
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
        <Button variant="ghost" className="h-10 w-full justify-start gap-3" onClick={onCreateNote} disabled={loading || loadError}>
          <Plus aria-hidden="true" />
          New note
        </Button>
      </div>
      <section aria-labelledby={notesHeadingId}>
        <h2 id={notesHeadingId} className="px-3 text-xs font-semibold text-muted-foreground">Notes</h2>
        {loading || loadError ? (
          <p className="mt-3 px-3 text-sm text-muted-foreground">{loading ? 'Loading notes…' : 'Notes unavailable.'}</p>
        ) : notes.length === 0 ? (
          <p className="mt-3 px-3 text-sm leading-relaxed text-muted-foreground">
            No notes yet. Create a note to get started.
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {notes.map((note) => (
              <NoteRow
                key={note.id}
                note={note}
                selected={selectedNoteId === note.id}
                onSelect={onSelectNote}
                onRename={onRenameNote}
                onDelete={onDeleteNote}
              />
            ))}
          </ul>
        )}
      </section>
    </nav>
  )
}
