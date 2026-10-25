import type { JSONContent } from '@tiptap/react'

export type Note = {
  id: string
  title: string
  content: JSONContent
  createdAt: number
}

export type NoteChanges = Partial<Pick<Note, 'title' | 'content'>>
