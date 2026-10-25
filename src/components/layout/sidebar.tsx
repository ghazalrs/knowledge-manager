import { useId, useState } from 'react'
import { FolderPlus, Home, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NoteRow } from '@/components/notes/note-row'
import type { Note } from '@/types/note'
import type { Folder } from '@/types/folder'
import { FolderRow } from '@/components/folders/folder-row'
import { useNoteDrop } from '@/hooks/use-note-drop'

type SidebarProps = {
  notes: Note[]
  folders: Folder[]
  loading: boolean
  loadError: boolean
  selectedNoteId: string | null
  onHome: () => void
  onCreateNote: (folderId?: string | null) => void
  onSelectNote: (id: string) => void
  onRenameNote: (id: string, title: string) => void
  onDeleteNote: (id: string) => void
  onMoveNote: (id: string, folderId: string | null) => void
  onCreateFolder: () => void
  onRenameFolder: (id: string, name: string) => void
  onDeleteFolder: (id: string) => void
}

export function Sidebar({ notes, folders, loading, loadError, selectedNoteId, onHome, onCreateNote, onSelectNote, onRenameNote, onDeleteNote, onMoveNote, onCreateFolder, onRenameFolder, onDeleteFolder }: SidebarProps) {
  const notesHeadingId = useId()
  const foldersHeadingId = useId()
  const topLevelNotes = notes.filter((note) => note.folderId === null)
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null)
  const draggedNote = notes.find((note) => note.id === draggedNoteId)
  const { isOver, dropProps } = useNoteDrop(null, draggedNote, onMoveNote, () => setDraggedNoteId(null))

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
        <Button variant="ghost" className="h-10 w-full justify-start gap-3" onClick={() => onCreateNote()} disabled={loading || loadError}>
          <Plus aria-hidden="true" />
          New note
        </Button>
        <Button variant="ghost" className="h-10 w-full justify-start gap-3" onClick={onCreateFolder} disabled={loading || loadError}>
          <FolderPlus aria-hidden="true" />
          New folder
        </Button>
      </div>
      <section aria-labelledby={foldersHeadingId}>
        <h2 id={foldersHeadingId} className="px-3 text-xs font-semibold text-muted-foreground">Folders</h2>
        {loading || loadError ? (
          <p className="mt-3 px-3 text-sm text-muted-foreground">{loading ? 'Loading folders…' : 'Folders unavailable.'}</p>
        ) : folders.length === 0 ? (
          <p className="mt-3 px-3 text-sm text-muted-foreground">No folders yet.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {folders.map((folder) => (
              <FolderRow
                key={folder.id} folder={folder} notes={notes.filter((note) => note.folderId === folder.id)}
                selectedNoteId={selectedNoteId} onRename={onRenameFolder} onDelete={onDeleteFolder}
                onCreateNote={onCreateNote} onSelectNote={onSelectNote} onRenameNote={onRenameNote} onDeleteNote={onDeleteNote}
                draggedNote={draggedNote} onDragNote={setDraggedNoteId} onMoveNote={onMoveNote}
              />
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby={notesHeadingId} {...dropProps}
        className={`min-h-20 rounded-lg ${isOver ? 'bg-accent ring-2 ring-ring' : ''}`}>
        <h2 id={notesHeadingId} className="px-3 text-xs font-semibold text-muted-foreground">Notes</h2>
        {loading || loadError ? (
          <p className="mt-3 px-3 text-sm text-muted-foreground">{loading ? 'Loading notes…' : 'Notes unavailable.'}</p>
        ) : topLevelNotes.length === 0 ? (
          <p className="mt-3 px-3 text-sm leading-relaxed text-muted-foreground">
            No top-level notes yet.
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {topLevelNotes.map((note) => (
              <NoteRow
                key={note.id}
                note={note}
                selected={selectedNoteId === note.id}
                onSelect={onSelectNote}
                onRename={onRenameNote}
                onDelete={onDeleteNote}
                onDragNote={setDraggedNoteId}
              />
            ))}
          </ul>
        )}
      </section>
    </nav>
  )
}
