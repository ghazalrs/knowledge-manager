import type { Note } from '@/types/note'
import { NoteEditor } from '@/components/notes/note-editor'

type NoteViewProps = {
  note: Note
  onContentChange: (id: string, content: Note['content']) => void
}

export function NoteView({ note, onContentChange }: NoteViewProps) {
  return (
    <section className="mx-auto w-full max-w-3xl" aria-labelledby="note-title">
      <h1 id="note-title" className="break-words text-3xl font-semibold tracking-tight">{note.title}</h1>
      <NoteEditor content={note.content} onChange={(content) => onContentChange(note.id, content)} />
    </section>
  )
}
