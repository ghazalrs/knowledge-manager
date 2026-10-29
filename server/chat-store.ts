import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import type { ChatMode, Conversation, NoteProposal, ProposalAction, StoredChatMessage } from '../src/types/chat.ts'
import type { Note } from '../src/types/note.ts'
import { RequestError } from './api.ts'
import { noteText, textDocument } from '../src/lib/note-text.ts'
import { findRelatedNotes } from './related-notes.ts'

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
    this.db.exec(`CREATE TABLE IF NOT EXISTS note_revisions (
      id TEXT PRIMARY KEY,
      noteId TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      proposalMessageId TEXT NOT NULL UNIQUE,
      beforeNote TEXT NOT NULL,
      afterNote TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      undone INTEGER NOT NULL DEFAULT 0
    )`)
    this.db.prepare('INSERT INTO conversations (id, title, createdAt) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING')
      .run('main', 'Chat', Date.now())
  }

  private note(row: Record<string, unknown>): Note {
    return { id: row.id as string, title: row.title as string, content: JSON.parse(row.content as string), folderId: row.folderId as string | null, createdAt: row.createdAt as number }
  }

  relatedNotes(query: string, recentUserMessages: string[] = []) {
    if (!this.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'notes'").get()) return []
    return findRelatedNotes(this.db.prepare('SELECT * FROM notes').all().map((row) => this.note(row)), query, recentUserMessages)
  }

  private currentNote(id: string): Note | null {
    const row = this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id)
    return row ? this.note(row) : null
  }

  loadNote(id: string): Note | null { return this.currentNote(id) }

  private matchesNote(current: Note | null, expected: Note) {
    return current !== null && current.title === expected.title && current.folderId === expected.folderId
      && JSON.stringify(current.content) === JSON.stringify(expected.content)
  }

  private message(row: Record<string, unknown>): StoredChatMessage {
    return { id: row.id as string, role: row.role as StoredChatMessage['role'], content: row.content as string, createdAt: row.createdAt as number,
      mode: (row.mode ?? 'ask') as ChatMode, ...(typeof row.proposal === 'string' ? { proposal: JSON.parse(row.proposal) as NoteProposal } : {}),
      ...(typeof row.replyTo === 'string' ? { replyTo: row.replyTo } : {}) }
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

  resolveProposal(conversationId: string, messageId: string, action: ProposalAction, title?: string, content?: string, document?: Note['content']): { message: StoredChatMessage; note: Note | null } {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const row = this.db.prepare("SELECT * FROM chat_messages WHERE id = ? AND conversationId = ? AND role = 'assistant'").get(messageId, conversationId)
      if (!row || !row.proposal) throw new RequestError(404, 'Note proposal not found.')
      const message = this.message(row)
      const proposal = message.proposal!
      let note: Note | null = null
      if (action === 'reopen') {
        if (proposal.status !== 'discarded' && proposal.status !== 'pending') throw new RequestError(409, 'Only discarded proposals can be reopened.')
        if (proposal.status === 'discarded') {
          message.proposal = { ...proposal, status: 'pending' }
          this.db.prepare('UPDATE chat_messages SET proposal = ? WHERE id = ?').run(JSON.stringify(message.proposal), messageId)
        }
      } else if (action === 'undo') {
        if (proposal.action !== 'update' || !['saved', 'undone'].includes(proposal.status)) throw new RequestError(409, 'Only a saved update can be undone.')
        const revision = this.db.prepare('SELECT * FROM note_revisions WHERE proposalMessageId = ?').get(messageId)
        if (!revision) throw new RequestError(404, 'The original version is unavailable.')
        const before = JSON.parse(revision.beforeNote as string) as Note
        const after = JSON.parse(revision.afterNote as string) as Note
        note = this.currentNote(after.id)
        if (!revision.undone) {
          if (!this.matchesNote(note, after)) throw new RequestError(409, 'This note changed or was deleted after the update. Undo would overwrite later changes.')
          this.db.prepare('UPDATE notes SET title = ?, content = ? WHERE id = ?').run(before.title, JSON.stringify(before.content), before.id)
          this.db.prepare('UPDATE note_revisions SET undone = 1 WHERE proposalMessageId = ?').run(messageId)
          note = before
          message.proposal = { ...proposal, status: 'undone' }
          this.db.prepare('UPDATE chat_messages SET proposal = ? WHERE id = ?').run(JSON.stringify(message.proposal), messageId)
        }
      } else if (proposal.status === 'undone') {
        throw new RequestError(409, 'This update was undone. Submit a new request to propose another change.')
      } else if (proposal.status === 'saved') {
        if (action !== 'save') throw new RequestError(409, 'This proposal has already been saved.')
        note = this.currentNote(proposal.noteId!)
      } else if (proposal.status === 'discarded') {
        if (action !== 'discard') throw new RequestError(409, 'This proposal was discarded.')
      } else {
        if (action === 'save') {
          if (proposal.action === 'update') {
            const original = proposal.originalNote
            if (!original || !this.matchesNote(this.currentNote(original.id), original)) throw new RequestError(409, 'This note changed or was deleted since the proposal. Discard it and request a fresh proposal.')
            note = { ...original, title: title!, content: document ?? textDocument(content!) }
            this.db.prepare('INSERT INTO note_revisions (id, noteId, proposalMessageId, beforeNote, afterNote, createdAt) VALUES (?, ?, ?, ?, ?, ?)')
              .run(randomUUID(), note.id, messageId, JSON.stringify(original), JSON.stringify(note), Date.now())
            this.db.prepare('UPDATE notes SET title = ?, content = ? WHERE id = ?').run(note.title, JSON.stringify(note.content), note.id)
          } else {
            note = { id: randomUUID(), title: title!, folderId: null, createdAt: Date.now(), content: document ?? textDocument(content!) }
            this.db.prepare('INSERT INTO notes (id, title, content, createdAt, folderId) VALUES (?, ?, ?, ?, NULL)').run(note.id, note.title, JSON.stringify(note.content), note.createdAt)
          }
          message.proposal = { ...proposal, title: title!, content: noteText(note.content), document: note.content, status: 'saved', noteId: note.id }
        } else message.proposal = { ...proposal, ...(document ? { title: title ?? proposal.title, content: noteText(document), document } : {}), status: 'discarded' }
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
