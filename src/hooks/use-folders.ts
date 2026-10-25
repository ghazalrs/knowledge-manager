import { useEffect, useRef, useState } from 'react'
import { foldersApi } from '@/lib/folders-api'
import type { Folder } from '@/types/folder'

type Change = { type: 'create'; folder: Folder } | { type: 'rename'; id: string; name: string } | { type: 'delete'; id: string }

export function useFolders() {
  const [folders, setFolders] = useState<Folder[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const currentFolders = useRef<Folder[]>([])
  const ready = useRef(false)
  const pending = useRef<Change[]>([])
  const saving = useRef(false)

  useEffect(() => {
    let cancelled = false
    ready.current = false
    foldersApi.loadFolders().then((savedFolders) => {
      if (cancelled) return
      currentFolders.current = savedFolders
      setFolders(savedFolders)
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
      while (pending.current.length) {
        const change = pending.current[0]
        if (change.type === 'create') await foldersApi.createFolder(change.folder)
        else if (change.type === 'rename') await foldersApi.renameFolder(change.id, change.name)
        else await foldersApi.deleteFolder(change.id)
        pending.current.shift()
      }
      setSaveStatus('saved')
    } catch {
      // Keep failed changes queued for retry, matching note saves.
      setSaveStatus('error')
    } finally {
      saving.current = false
    }
  }

  function applyChange(change: Change, nextFolders: Folder[]) {
    currentFolders.current = nextFolders
    setFolders(nextFolders)
    pending.current.push(change)
    void flushChanges()
  }

  function createFolder() {
    if (!ready.current) return
    const folder: Folder = {
      id: crypto.randomUUID(), name: 'Untitled folder',
      createdAt: Math.max(Date.now(), (currentFolders.current[0]?.createdAt ?? 0) + 1),
    }
    applyChange({ type: 'create', folder }, [folder, ...currentFolders.current])
  }

  function renameFolder(id: string, name: string) {
    const trimmed = name.trim()
    if (!ready.current || !trimmed || !currentFolders.current.some((folder) => folder.id === id)) return
    applyChange({ type: 'rename', id, name: trimmed }, currentFolders.current.map((folder) =>
      folder.id === id ? { ...folder, name: trimmed } : folder,
    ))
  }

  function deleteFolder(id: string) {
    if (!ready.current) return
    applyChange({ type: 'delete', id }, currentFolders.current.filter((folder) => folder.id !== id))
  }

  return {
    folders, loading, loadError, saveStatus, createFolder, renameFolder, deleteFolder,
    retryLoad: () => {
      setLoading(true)
      setLoadError(false)
      setLoadAttempt((attempt) => attempt + 1)
    },
    retrySave: () => { void flushChanges() },
  }
}
