export type ChatAttachment = {
  id: string
  file: File
}

export type ChatMessage = {
  id: string
  role: 'user'
  content: string
  attachments: ChatAttachment[]
}

export type WorkspaceView = 'home' | 'chat' | 'note'
