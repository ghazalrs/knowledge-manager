import type { Note } from '@/types/note'

export function NoteView({ note }: { note: Note }) {
  return (
    <section className="mx-auto w-full max-w-3xl" aria-labelledby="note-title">
      <h1 id="note-title" className="break-words text-3xl font-semibold tracking-tight">{note.title}</h1>
      <p className="mt-6 text-sm text-muted-foreground">Your note is ready. Editing is coming next.</p>
    </section>
  )
}
