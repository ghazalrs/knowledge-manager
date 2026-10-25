import { useState } from 'react'
import { PanelLeft, X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { Sidebar } from '@/components/layout/sidebar'
import { NoteView } from '@/components/notes/note-view'
import { Button } from '@/components/ui/button'
import type { Note } from '@/types/note'

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)

  const [notes, setNotes] = useState<Note[]>([])
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const selectedNote = notes.find((note) => note.id === selectedNoteId)

  function createNote() {
    const note: Note = { id: crypto.randomUUID(), title: 'Untitled' }
    setNotes((currentNotes) => [note, ...currentNotes])
    setSelectedNoteId(note.id)
    setMobileOpen(false)
  }

  function renameNote(id: string, title: string) {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) return
    setNotes((currentNotes) => currentNotes.map((note) =>
      note.id === id ? { ...note, title: trimmedTitle } : note,
    ))
  }

  function deleteNote(id: string) {
    setNotes((currentNotes) => currentNotes.filter((note) => note.id !== id))
    setSelectedNoteId((currentId) => currentId === id ? null : currentId)
  }

  function selectNote(id: string) {
    setSelectedNoteId(id)
    setMobileOpen(false)
  }

  function goHome() {
    setSelectedNoteId(null)
    setMobileOpen(false)
  }

  const sidebarProps = {
    notes,
    selectedNoteId,
    onHome: goHome,
    onCreateNote: createNote,
    onSelectNote: selectNote,
    onRenameNote: renameNote,
    onDeleteNote: deleteNote,
  }

  return (
    <div className="flex min-h-svh bg-background text-foreground">
      {sidebarOpen && (
        <aside id="desktop-sidebar" aria-label="Sidebar" className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r bg-sidebar md:flex">
          <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-4">
            <span className="text-sm font-semibold tracking-tight">Knowledge Manager</span>
            <Button variant="ghost" size="icon" aria-label="Collapse sidebar" aria-expanded={true} aria-controls="desktop-sidebar" onClick={() => setSidebarOpen(false)}>
              <PanelLeft aria-hidden="true" />
            </Button>
          </div>
          <Sidebar {...sidebarProps} />
        </aside>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4 sm:px-6">
          <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
            <Dialog.Trigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open sidebar">
                <PanelLeft aria-hidden="true" />
              </Button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 md:hidden" />
              <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r bg-sidebar outline-none md:hidden">
                <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-4">
                  <Dialog.Title className="text-sm font-semibold tracking-tight">Knowledge Manager</Dialog.Title>
                  <Dialog.Close asChild>
                    <Button variant="ghost" size="icon" aria-label="Close sidebar"><X aria-hidden="true" /></Button>
                  </Dialog.Close>
                </div>
                <Dialog.Description className="sr-only">Navigate your workspace and browse notes.</Dialog.Description>
                <Sidebar {...sidebarProps} />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          {!sidebarOpen && (
            <Button variant="ghost" size="icon" className="hidden md:inline-flex" aria-label="Expand sidebar" aria-expanded={false} aria-controls="desktop-sidebar" onClick={() => setSidebarOpen(true)}>
              <PanelLeft aria-hidden="true" />
            </Button>
          )}
          <span className="truncate text-sm text-muted-foreground">{selectedNote?.title ?? 'Home'}</span>
        </header>
        <main className={selectedNote ? 'flex-1 px-6 py-12' : 'flex flex-1 items-center justify-center px-6 py-16'}>
          {selectedNote ? (
            <NoteView
              key={selectedNote.id}
              note={selectedNote}
            />
          ) : (
          <section className="w-full max-w-lg text-center" aria-labelledby="welcome-title">
            <h1 id="welcome-title" className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Welcome to Knowledge Manager
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Your workspace for capturing ideas and organizing what you learn.
            </p>
          </section>
          )}
        </main>
      </div>
    </div>
  )
}

export default App
