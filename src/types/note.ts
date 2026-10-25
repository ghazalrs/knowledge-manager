import type { JSONContent } from '@tiptap/react'

export type Note = {
  id: string
  title: string
  content: JSONContent
  createdAt: number
  folderId: string | null
}

export type NoteChanges = Partial<Pick<Note, 'title' | 'content' | 'folderId'>>
