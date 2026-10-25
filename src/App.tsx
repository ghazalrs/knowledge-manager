import { useState } from 'react'
import { PanelLeft, X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { Sidebar } from '@/components/layout/sidebar'
import { NoteView } from '@/components/notes/note-view'
import { Button } from '@/components/ui/button'
import type { Note } from '@/types/note'
import { useNotes } from '@/hooks/use-notes'
import { useFolders } from '@/hooks/use-folders'

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)

  const {
    notes, loading: notesLoading, loadError: notesLoadError, saveStatus: notesSaveStatus,
    createNote: addNote, updateNote, deleteNote: removeNote, retryLoad: retryNotesLoad, retrySave: retryNotesSave,
  } = useNotes()
  const {
    folders, loading: foldersLoading, loadError: foldersLoadError, saveStatus: foldersSaveStatus,
    createFolder, renameFolder, deleteFolder, retryLoad: retryFoldersLoad, retrySave: retryFoldersSave,
  } = useFolders()
  const loading = notesLoading || foldersLoading
  const loadError = notesLoadError || foldersLoadError
  const saveStatus = notesSaveStatus === 'error' || foldersSaveStatus === 'error' ? 'error'
    : notesSaveStatus === 'saving' || foldersSaveStatus === 'saving' ? 'saving' : 'saved'

  function retryLoad() {
    if (notesLoadError) retryNotesLoad()
    if (foldersLoadError) retryFoldersLoad()
  }

  function retrySave() {
    retryNotesSave()
    retryFoldersSave()
  }
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const selectedNote = notes.find((note) => note.id === selectedNoteId)

  function createNote() {
    const id = addNote()
    if (!id) return
    setSelectedNoteId(id)
    setMobileOpen(false)
  }

  function renameNote(id: string, title: string) {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) return
    updateNote(id, { title: trimmedTitle })
  }

  function updateNoteContent(id: string, content: Note['content']) {
    updateNote(id, { content })
  }

  function deleteNote(id: string) {
    removeNote(id)
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
    folders,
    loading,
    loadError,
    selectedNoteId,
    onHome: goHome,
    onCreateNote: createNote,
    onSelectNote: selectNote,
    onRenameNote: renameNote,
    onDeleteNote: deleteNote,
    onCreateFolder: createFolder,
    onRenameFolder: renameFolder,
    onDeleteFolder: deleteFolder,
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
          {!loading && !loadError && (
            <span role="status" className="ml-auto shrink-0 text-xs text-muted-foreground">
              {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved locally' : 'Unsaved changes'}
            </span>
          )}
        </header>
        {loadError && (
          <div role="alert" className="flex flex-wrap items-center gap-3 px-6 py-3 text-sm text-destructive">
            <p>Could not load your notes or folders. Check that the local server is running, then retry.</p>
            <Button variant="outline" onClick={retryLoad}>Retry</Button>
          </div>
        )}
        {saveStatus === 'error' && (
          <div role="alert" className="flex flex-wrap items-center gap-3 px-6 py-3 text-sm text-destructive">
            <p>Changes could not be saved. Keep this page open and retry to save them.</p>
            <Button variant="outline" onClick={retrySave}>Retry save</Button>
          </div>
        )}
        <main className={selectedNote ? 'flex-1 px-6 py-12' : 'flex flex-1 items-center justify-center px-6 py-16'}>
          {loading ? <p role="status">Loading workspace…</p> : selectedNote ? (
            <NoteView
              key={selectedNote.id}
              note={selectedNote}
              onContentChange={updateNoteContent}
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
