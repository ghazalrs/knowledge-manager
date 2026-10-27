import { useEffect, useRef, useState } from 'react'
import { notesApi } from '@/lib/notes-api'
import { foldersApi } from '@/lib/folders-api'
import type { Note, NoteChanges } from '@/types/note'
import type { Folder } from '@/types/folder'

type Workspace = { notes: Note[]; folders: Folder[] }
type Change =
  | { type: 'note-create'; note: Note }
  | { type: 'note-update'; id: string; changes: NoteChanges }
  | { type: 'note-delete'; id: string }
  | { type: 'folder-create'; folder: Folder }
  | { type: 'folder-rename'; id: string; name: string }
  | { type: 'folder-delete'; id: string }

export function useWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace>({ notes: [], folders: [] })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const current = useRef(workspace)
  const ready = useRef(false)
  const pending = useRef<Change[]>([])
  const saving = useRef(false)

  useEffect(() => {
    let cancelled = false
    ready.current = false
    Promise.all([notesApi.loadNotes(), foldersApi.loadFolders()]).then(([notes, folders]) => {
      if (cancelled) return
      const loaded = { notes, folders }
      current.current = loaded
      setWorkspace(loaded)
      ready.current = true
      setLoading(false)
    }).catch(() => {
      if (cancelled) return
      setLoadError(true)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [loadAttempt])

  async function flushChanges() {
    if (saving.current || !pending.current.length) return
    saving.current = true
    setSaveStatus('saving')
    try {
      // One queue keeps folder creation, note edits, and folder deletion in order.
      while (pending.current.length) {
        const change = pending.current[0]
        switch (change.type) {
          case 'note-create': await notesApi.createNote(change.note); break
          case 'note-update': await notesApi.updateNote(change.id, change.changes); break
          case 'note-delete': await notesApi.deleteNote(change.id); break
          case 'folder-create': await foldersApi.createFolder(change.folder); break
          case 'folder-rename': await foldersApi.renameFolder(change.id, change.name); break
          case 'folder-delete': await foldersApi.deleteFolder(change.id); break
        }
        pending.current.shift()
      }
      setSaveStatus('saved')
    } catch {
      // Preserve the failed operation and everything after it for Retry save.
      setSaveStatus('error')
    } finally {
      saving.current = false
    }
  }

  function applyChange(change: Change, next: Workspace) {
    current.current = next
    setWorkspace(next)
    pending.current.push(change)
    void flushChanges()
  }

  function createNote(folderId: string | null = null) {
    if (!ready.current || (folderId !== null && !current.current.folders.some((folder) => folder.id === folderId))) return null
    const note: Note = {
      id: crypto.randomUUID(), title: 'Untitled', folderId,
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      createdAt: Math.max(Date.now(), (current.current.notes[0]?.createdAt ?? 0) + 1),
    }
    applyChange({ type: 'note-create', note }, { ...current.current, notes: [note, ...current.current.notes] })
    return note.id
  }

  function updateNote(id: string, changes: NoteChanges) {
    if (!ready.current || !current.current.notes.some((note) => note.id === id)) return
    applyChange({ type: 'note-update', id, changes }, {
      ...current.current, notes: current.current.notes.map((note) => note.id === id ? { ...note, ...changes } : note),
    })
  }

  function deleteNote(id: string) {
    if (!ready.current) return
    applyChange({ type: 'note-delete', id }, { ...current.current, notes: current.current.notes.filter((note) => note.id !== id) })
  }

  function moveNote(id: string, folderId: string | null) {
    const note = current.current.notes.find((item) => item.id === id)
    if (!ready.current || !note || note.folderId === folderId) return
    if (folderId !== null && !current.current.folders.some((folder) => folder.id === folderId)) return
    updateNote(id, { folderId })
  }

  function createFolder() {
    if (!ready.current) return
    const folder: Folder = {
      id: crypto.randomUUID(), name: 'Untitled folder',
      createdAt: Math.max(Date.now(), (current.current.folders[0]?.createdAt ?? 0) + 1),
    }
    applyChange({ type: 'folder-create', folder }, { ...current.current, folders: [folder, ...current.current.folders] })
  }

  function renameFolder(id: string, name: string) {
    const trimmed = name.trim()
    if (!ready.current || !trimmed || !current.current.folders.some((folder) => folder.id === id)) return
    applyChange({ type: 'folder-rename', id, name: trimmed }, {
      ...current.current, folders: current.current.folders.map((folder) => folder.id === id ? { ...folder, name: trimmed } : folder),
    })
  }

  function deleteFolder(id: string) {
    if (!ready.current) return
    applyChange({ type: 'folder-delete', id }, {
      folders: current.current.folders.filter((folder) => folder.id !== id),
      notes: current.current.notes.filter((note) => note.folderId !== id),
    })
  }

  return {
    ...workspace, loading, loadError, saveStatus, createNote, updateNote, deleteNote, moveNote,
    createFolder, renameFolder, deleteFolder,
    includeSavedNote: (note: Note) => {
      if (pending.current.some((change) => (change.type === 'note-delete' && change.id === note.id)
        || (change.type === 'folder-delete' && change.id === note.folderId))) return
      const merged = pending.current.reduce((value, change) => change.type === 'note-update' && change.id === note.id ? { ...value, ...change.changes } : value, note)
      const next = { ...current.current, notes: [merged, ...current.current.notes.filter((item) => item.id !== note.id)].sort((a, b) => b.createdAt - a.createdAt) }
      current.current = next
      setWorkspace(next)
    },
    retryLoad: () => {
      setLoading(true)
      setLoadError(false)
      setLoadAttempt((attempt) => attempt + 1)
    },
    retrySave: () => { void flushChanges() },
  }
}
