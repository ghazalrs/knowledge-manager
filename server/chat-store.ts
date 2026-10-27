import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import type { ChatMode, Conversation, NoteProposal, StoredChatMessage } from '../src/types/chat.ts'
import type { Note } from '../src/types/note.ts'
import { RequestError } from './api.ts'

export class ChatStore {
  private db: DatabaseSync

  constructor(path: string) {
    this.db = new DatabaseSync(path)
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        createdAt INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS chat_messages (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        conversationId TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        replyTo TEXT UNIQUE REFERENCES chat_messages(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS chat_messages_conversation ON chat_messages(conversationId, sequence);
    `)
    const columns = this.db.prepare('PRAGMA table_info(conversations)').all()
    if (!columns.some((column) => column.name === 'titleState')) {
      this.db.exec("ALTER TABLE conversations ADD COLUMN titleState TEXT NOT NULL DEFAULT 'fallback'")
    }
    if (!columns.some((column) => column.name === 'titleMessageId')) {
      this.db.exec('ALTER TABLE conversations ADD COLUMN titleMessageId TEXT')
    }
    this.db.exec("UPDATE conversations SET titleState = 'fallback', titleMessageId = NULL WHERE titleState = 'pending'")
    const messageColumns = this.db.prepare('PRAGMA table_info(chat_messages)').all()
    if (!messageColumns.some((column) => column.name === 'mode')) this.db.exec("ALTER TABLE chat_messages ADD COLUMN mode TEXT NOT NULL DEFAULT 'ask'")
    if (!messageColumns.some((column) => column.name === 'proposal')) this.db.exec('ALTER TABLE chat_messages ADD COLUMN proposal TEXT')
    this.db.prepare('INSERT INTO conversations (id, title, createdAt) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING')
      .run('main', 'Chat', Date.now())
  }

  private message(row: Record<string, unknown>): StoredChatMessage {
    return { id: row.id as string, role: row.role as StoredChatMessage['role'], content: row.content as string, createdAt: row.createdAt as number,
      mode: (row.mode ?? 'ask') as ChatMode, ...(typeof row.proposal === 'string' ? { proposal: JSON.parse(row.proposal) as NoteProposal } : {}) }
  }

  listConversations(): Conversation[] {
    return this.db.prepare(`SELECT c.id, c.title, c.createdAt, c.titleState,
      (SELECT content FROM chat_messages WHERE conversationId = c.id AND role = 'user' ORDER BY sequence LIMIT 1) AS firstMessage
      FROM conversations c WHERE c.id <> 'main' OR EXISTS (SELECT 1 FROM chat_messages WHERE conversationId = c.id)
      ORDER BY c.createdAt DESC, c.id DESC`).all().map((row) => ({
        id: row.id as string,
        title: !['generated', 'manual'].includes(row.titleState as string) && ['New chat', 'Chat'].includes(row.title as string) && typeof row.firstMessage === 'string' ? row.firstMessage.replace(/\s+/g, ' ').trim().slice(0, 80) : row.title as string,
        createdAt: row.createdAt as number,
        titleState: row.titleState as Conversation['titleState'],
      }))
  }

  hasConversation(id: string) {
    return !!this.db.prepare('SELECT id FROM conversations WHERE id = ?').get(id)
  }

  renameConversation(id: string, title: string) {
    this.db.prepare("UPDATE conversations SET title = ?, titleState = 'manual' WHERE id = ?").run(title, id)
    return this.listConversations().find((conversation) => conversation.id === id)
  }

  deleteConversation(id: string) {
    this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
  }

  claimTitle(id: string, messageId = '') {
    return this.db.prepare("UPDATE conversations SET titleState = 'pending', titleMessageId = ? WHERE id = ? AND titleState NOT IN ('manual', 'pending') AND titleMessageId IS NOT ?")
      .run(messageId, id, messageId).changes > 0
  }

  finishTitle(id: string, title?: string) {
    this.db.prepare("UPDATE conversations SET title = COALESCE(?, title), titleState = ? WHERE id = ? AND titleState = 'pending'")
      .run(title || null, title ? 'generated' : 'failed', id)
  }

  createConversation(id: string): Conversation {
    this.db.prepare(`INSERT INTO conversations (id, title, createdAt)
      VALUES (?, 'New chat', MAX(?, COALESCE((SELECT MAX(createdAt) + 1 FROM conversations), 0))) ON CONFLICT(id) DO NOTHING`)
      .run(id, Date.now())
    return this.listConversations().find((conversation) => conversation.id === id)!
  }

  loadMessages(conversationId = 'main'): StoredChatMessage[] {
    return this.db.prepare('SELECT * FROM chat_messages WHERE conversationId = ? ORDER BY sequence')
      .all(conversationId).map((row) => this.message(row))
  }

  saveUserMessage(id: string, content: string, conversationId = 'main', mode: ChatMode = 'ask') {
    if (!this.hasConversation(conversationId)) return false
    const existing = this.db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(id)
    if (existing) return existing.role === 'user' && existing.content === content && existing.conversationId === conversationId && existing.mode === mode
    this.db.prepare('INSERT INTO chat_messages (id, conversationId, role, content, createdAt, mode) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, conversationId, 'user', content, Date.now(), mode)
    return true
  }

  findReply(userId: string, conversationId = 'main'): StoredChatMessage | undefined {
    const row = this.db.prepare('SELECT * FROM chat_messages WHERE replyTo = ? AND conversationId = ?').get(userId, conversationId)
    return row ? this.message(row) : undefined
  }

  saveReply(userId: string, content: string, conversationId = 'main', proposal?: NoteProposal): StoredChatMessage {
    const user = this.db.prepare("SELECT id, mode FROM chat_messages WHERE id = ? AND conversationId = ? AND role = 'user'").get(userId, conversationId)
    if (!user) throw new Error('User message does not belong to this conversation')
    this.db.prepare(`INSERT INTO chat_messages (id, conversationId, role, content, createdAt, replyTo, mode, proposal)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(replyTo) DO NOTHING`)
      .run(randomUUID(), conversationId, 'assistant', content, Date.now(), userId, user.mode as string, proposal ? JSON.stringify(proposal) : null)
    return this.findReply(userId, conversationId)!
  }

  resolveProposal(conversationId: string, messageId: string, action: 'save' | 'discard', title?: string, content?: string): { message: StoredChatMessage; note: Note | null } {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const row = this.db.prepare("SELECT * FROM chat_messages WHERE id = ? AND conversationId = ? AND role = 'assistant'").get(messageId, conversationId)
      if (!row || !row.proposal) throw new RequestError(404, 'Note proposal not found.')
      const message = this.message(row)
      const proposal = message.proposal!
      let note: Note | null = null
      if (proposal.status === 'saved') {
        if (action !== 'save') throw new RequestError(409, 'This proposal has already been saved.')
        const saved = this.db.prepare('SELECT * FROM notes WHERE id = ?').get(proposal.noteId!)
        if (saved) note = { id: saved.id as string, title: saved.title as string, content: JSON.parse(saved.content as string), folderId: saved.folderId as string | null, createdAt: saved.createdAt as number }
      } else if (proposal.status === 'discarded') {
        if (action !== 'discard') throw new RequestError(409, 'This proposal was discarded.')
      } else {
        if (action === 'save') {
          note = { id: randomUUID(), title: title!, folderId: null, createdAt: Date.now(), content: { type: 'doc', content: content!.split('\n').map((line) => ({ type: 'paragraph', ...(line ? { content: [{ type: 'text', text: line }] } : {}) })) } }
          this.db.prepare('INSERT INTO notes (id, title, content, createdAt, folderId) VALUES (?, ?, ?, ?, NULL)').run(note.id, note.title, JSON.stringify(note.content), note.createdAt)
          message.proposal = { title: title!, content: content!, status: 'saved', noteId: note.id }
        } else message.proposal = { ...proposal, status: 'discarded' }
        this.db.prepare('UPDATE chat_messages SET proposal = ? WHERE id = ?').run(JSON.stringify(message.proposal), messageId)
      }
      this.db.exec('COMMIT')
      return { message, note }
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }

  contextThrough(userId: string, conversationId = 'main') {
    // Exclude any later messages if an older request is retried.
    return this.db.prepare(`SELECT id, role, content, createdAt FROM chat_messages
      WHERE conversationId = ? AND sequence <= (SELECT sequence FROM chat_messages WHERE id = ? AND conversationId = ?)
      ORDER BY sequence`).all(conversationId, userId, conversationId).map((row) => this.message(row))
  }

  close() { this.db.close() }
}
