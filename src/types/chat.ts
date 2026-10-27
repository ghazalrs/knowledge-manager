export type ChatAttachment = {
  id: string
  file: File
}

export type ChatMode = 'ask' | 'organize'
export type NoteProposal = { title: string; content: string; status: 'pending' | 'saved' | 'discarded'; noteId?: string }

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments: ChatAttachment[]
  mode?: ChatMode
  proposal?: NoteProposal
}

export type ChatTextMessage = Pick<ChatMessage, 'role' | 'content'>

export type StoredChatMessage = ChatTextMessage & { id: string; createdAt: number; mode?: ChatMode; proposal?: NoteProposal }

export type Conversation = { id: string; title: string; createdAt: number; titleState?: 'fallback' | 'pending' | 'generated' | 'manual' | 'failed' }

export type WorkspaceView = 'home' | 'chat' | 'note'
