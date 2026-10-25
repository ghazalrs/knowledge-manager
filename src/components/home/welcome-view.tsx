import { useId, useRef, useState } from 'react'
import { ArrowLeft, ChevronRight, FileText, Folder as FolderIcon, NotebookPen, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Folder } from '@/types/folder'
import type { Note } from '@/types/note'
import { searchWorkspace } from '@/lib/search'

type WelcomeViewProps = {
  folders: Folder[]
  notes: Note[]
  onOpenNote: (id: string) => void
}

const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

export function WelcomeView({ folders, notes, onOpenNote }: WelcomeViewProps) {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const searchId = useId()
  const searchInput = useRef<HTMLInputElement>(null)
  const searching = query.trim().length > 0
  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId)
  const { notes: visibleNotes, folders: visibleFolders } = searchWorkspace(notes, folders, query, selectedFolder?.id ?? null)
  const folderNames = new Map(folders.map((folder) => [folder.id, folder.name]))
  const noteCounts = new Map<string, number>()
  for (const note of notes) {
    if (note.folderId !== null) noteCounts.set(note.folderId, (noteCounts.get(note.folderId) ?? 0) + 1)
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 sm:space-y-10">
      <section aria-labelledby="welcome-title">
        <h1 id="welcome-title" className="text-xl font-medium tracking-tight sm:text-2xl">Welcome to Knowledge Manager</h1>
        <p className="mt-2 text-sm text-muted-foreground">Your notes and folders, all in one place.</p>
        <div role="search" aria-label="Search workspace" className="mt-6 flex items-center gap-3 rounded-2xl bg-muted/65 px-4 focus-within:ring-2 focus-within:ring-ring">
          <Search aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
          <label htmlFor={searchId} className="sr-only">Search notes and folders</label>
          <input ref={searchInput} id={searchId} type="search" value={query}
            placeholder="Search notes and folders"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Escape') setQuery('') }}
            className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none" />
          {query && (
            <Button variant="ghost" size="icon" type="button" aria-label="Clear search" onClick={() => {
              setQuery('')
              searchInput.current?.focus()
            }}>
              <X aria-hidden="true" />
            </Button>
          )}
        </div>
        <p role="status" className="sr-only">{visibleFolders.length} folders and {visibleNotes.length} notes found{selectedFolder ? `; notes filtered to ${selectedFolder.name}` : ''}.</p>
      </section>

      <section aria-labelledby="home-folders-heading">
        <div className="mb-4 flex items-center gap-2">
          <h2 id="home-folders-heading" className="text-sm font-medium">Folders</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{visibleFolders.length}</span>
        </div>
        {visibleFolders.length === 0 ? (
          <div className="rounded-2xl bg-muted/50 px-5 py-6 text-sm text-muted-foreground">
            {searching ? 'No folders match your search.' : 'No folders yet. Use New folder in the sidebar to create one.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleFolders.map((folder) => {
              const count = noteCounts.get(folder.id) ?? 0
              const selected = selectedFolder?.id === folder.id
              return (
                <button key={folder.id} type="button" aria-pressed={selected}
                  onClick={() => setSelectedFolderId(folder.id)}
                  className={`group flex min-w-0 items-center gap-3 rounded-2xl p-4 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? 'bg-accent ring-1 ring-border' : 'bg-muted/65 hover:bg-accent'}`}>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-background/80">
                    <FolderIcon aria-hidden="true" className="size-5 text-muted-foreground" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{folder.name}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{count} {count === 1 ? 'note' : 'notes'}</span>
                  </span>
                  <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-foreground" />
                </button>
              )
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="home-notes-heading">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <h2 id="home-notes-heading" className="min-w-0 break-words text-sm font-medium">{selectedFolder ? selectedFolder.name : 'All notes'}</h2>
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{visibleNotes.length}</span>
          </div>
          {selectedFolder && (
            <Button variant="ghost" onClick={() => setSelectedFolderId(null)}>
              <ArrowLeft aria-hidden="true" /> All notes
            </Button>
          )}
        </div>
        {visibleNotes.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl bg-muted/40 px-5 py-12 text-center">
            <NotebookPen aria-hidden="true" className="mb-3 size-7 text-muted-foreground" />
            <p className="text-sm font-medium">{searching ? 'No notes match your search' : selectedFolder ? 'This folder is empty' : 'No notes yet'}</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {searching ? `Try a different search or clear it${selectedFolder ? ', or choose All notes to search every folder' : ''}.` : selectedFolder ? 'Choose New note from this folder’s sidebar menu to add a note.' : 'Use New note in the sidebar to capture your first idea.'}
            </p>
          </div>
        ) : (
          <table className="w-full table-fixed text-left text-sm">
            <caption className="sr-only">{selectedFolder ? `Notes in ${selectedFolder.name}` : 'All notes in your workspace'}</caption>
            <thead className="border-b border-border/70 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="w-3/5 px-3 pb-3 font-medium sm:w-1/2">Name</th>
                <th scope="col" className="px-3 pb-3 font-medium sm:w-1/4">Folder</th>
                <th scope="col" className="hidden px-3 pb-3 font-medium sm:table-cell">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {visibleNotes.map((note) => (
                <tr key={note.id} className="transition-colors hover:bg-muted/60 focus-within:bg-muted/60">
                  <td className="p-0">
                    <button type="button" onClick={() => onOpenNote(note.id)}
                      className="flex w-full min-w-0 items-center gap-3 px-3 py-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                      <FileText aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{note.title}</span>
                    </button>
                  </td>
                  <td className="px-3 py-3.5 text-xs text-muted-foreground sm:text-sm">
                    <span className="block truncate">{note.folderId === null ? 'Top level' : folderNames.get(note.folderId) ?? 'Unknown folder'}</span>
                  </td>
                  <td className="hidden px-3 py-3.5 text-muted-foreground sm:table-cell">
                    <time dateTime={new Date(note.createdAt).toISOString()}>{dateFormat.format(note.createdAt)}</time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
