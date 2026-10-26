export type ChatAttachment = {
  id: string
  file: File
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments: ChatAttachment[]
}

export type ChatTextMessage = Pick<ChatMessage, 'role' | 'content'>

export type StoredChatMessage = ChatTextMessage & { id: string; createdAt: number }

export type Conversation = { id: string; title: string; createdAt: number; titleState?: 'fallback' | 'pending' | 'generated' | 'manual' | 'failed' }

export type WorkspaceView = 'home' | 'chat' | 'note'
