import type { Note } from './note.ts'

export type ChatAttachment = {
  id: string
  file: File
}

export type ChatMode = 'ask' | 'organize'
export type ProposalAction = 'save' | 'discard' | 'undo' | 'reopen'
export type NoteProposal = {
  title: string; content: string; status: 'pending' | 'saved' | 'discarded' | 'undone'; noteId?: string
  action?: 'create' | 'update'
  reason?: string
  originalNote?: Note
  relatedNotes?: { id: string; title: string }[]
  document?: Note['content']
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments: ChatAttachment[]
  mode?: ChatMode
  proposal?: NoteProposal
  replyTo?: string
}

export type ChatTextMessage = Pick<ChatMessage, 'role' | 'content'>

export type StoredChatMessage = ChatTextMessage & { id: string; createdAt: number; mode?: ChatMode; proposal?: NoteProposal; replyTo?: string }

export type Conversation = { id: string; title: string; createdAt: number; titleState?: 'fallback' | 'pending' | 'generated' | 'manual' | 'failed' }

export type WorkspaceView = 'home' | 'chat' | 'note'
