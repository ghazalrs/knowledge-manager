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

export type WorkspaceView = 'home' | 'chat' | 'note'
