import { useEffect, useRef, useState } from 'react'
import { notesApi } from '@/lib/notes-api'
import type { Note, NoteChanges } from '@/types/note'

type PendingChange = { type: 'create'; note: Note } | { type: 'update'; id: string; changes: NoteChanges } | { type: 'delete'; id: string }
type SaveStatus = 'saved' | 'saving' | 'error'

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const currentNotes = useRef<Note[]>([])
  const ready = useRef(false)
  const pending = useRef<PendingChange[]>([])
  const saving = useRef(false)

  useEffect(() => {
    let cancelled = false
    ready.current = false
    notesApi.loadNotes().then((savedNotes) => {
      if (cancelled) return
      currentNotes.current = savedNotes
      setNotes(savedNotes)
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
    if (saving.current || pending.current.length === 0) return
    saving.current = true
    setSaveStatus('saving')
    try {
      // Keep writes in order, including edits followed immediately by deletion.
      while (pending.current.length > 0) {
        const change = pending.current[0]
        if (change.type === 'create') await notesApi.createNote(change.note)
        else if (change.type === 'update') await notesApi.updateNote(change.id, change.changes)
        else await notesApi.deleteNote(change.id)
        pending.current.shift()
      }
      setSaveStatus('saved')
    } catch {
      // Leave failed and subsequent changes queued so Retry can save them.
      setSaveStatus('error')
    } finally {
      saving.current = false
    }
  }

  function applyChange(change: PendingChange, nextNotes: Note[]) {
    currentNotes.current = nextNotes
    setNotes(nextNotes)
    pending.current.push(change)
    void flushChanges()
  }

  function createNote() {
    if (!ready.current) return null
    const note: Note = {
      id: crypto.randomUUID(),
      title: 'Untitled',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      createdAt: Math.max(Date.now(), (currentNotes.current[0]?.createdAt ?? 0) + 1),
    }
    applyChange({ type: 'create', note }, [note, ...currentNotes.current])
    return note.id
  }

  function updateNote(id: string, changes: NoteChanges) {
    if (!ready.current) return
    const existing = currentNotes.current.find((note) => note.id === id)
    if (!existing) return
    const updated = { ...existing, ...changes }
    applyChange({ type: 'update', id, changes }, currentNotes.current.map((note) =>
      note.id === id ? updated : note,
    ))
  }

  function deleteNote(id: string) {
    if (!ready.current) return
    applyChange({ type: 'delete', id }, currentNotes.current.filter((note) => note.id !== id))
  }

  return {
    notes, loading, loadError, saveStatus, createNote, updateNote, deleteNote,
    retryLoad: () => {
      setLoading(true)
      setLoadError(false)
      setLoadAttempt((attempt) => attempt + 1)
    },
    retrySave: () => { void flushChanges() },
  }
}
