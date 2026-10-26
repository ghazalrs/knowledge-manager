import { useState } from 'react'
import { FolderPlus, Home, Plus, SquarePen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ChatHistoryRow } from '@/components/chat/chat-history-row'
import { NoteRow } from '@/components/notes/note-row'
import type { Note } from '@/types/note'
import type { Folder } from '@/types/folder'
import { FolderRow } from '@/components/folders/folder-row'
import { useNoteDrop } from '@/hooks/use-note-drop'
import type { Conversation, WorkspaceView } from '@/types/chat'
import { SidebarSection, type SidebarSectionId } from '@/components/layout/sidebar-section'

type SidebarProps = {
  notes: Note[]
  folders: Folder[]
  loading: boolean
  loadError: boolean
  selectedNoteId: string | null
  activeView: WorkspaceView
  conversations: Conversation[]
  activeConversationId: string
  collapsedSections: Record<SidebarSectionId, boolean>
  onToggleSection: (id: SidebarSectionId) => void
  chatLoading: boolean
  chatLoadError: boolean
  onRetryChatLoad: () => void
  onNewChat: () => void
  onSelectConversation: (id: string) => void
  onRenameConversation: (id: string, title: string) => void
  onDeleteConversation: (id: string) => void
  chatMutationError: string
  onHome: () => void
  onCreateNote: (folderId?: string | null) => void
  onSelectNote: (id: string) => void
  onRenameNote: (id: string, title: string) => void
  onDeleteNote: (id: string) => void
  onMoveNote: (id: string, folderId: string | null) => void
  onCreateFolder: () => void
  onRenameFolder: (id: string, name: string) => void
  onDeleteFolder: (id: string) => void
}

export function Sidebar({ notes, folders, loading, loadError, selectedNoteId, activeView, conversations, activeConversationId, collapsedSections, onToggleSection, chatLoading, chatLoadError, onRetryChatLoad, onNewChat, onSelectConversation, onRenameConversation, onDeleteConversation, chatMutationError, onHome, onCreateNote, onSelectNote, onRenameNote, onDeleteNote, onMoveNote, onCreateFolder, onRenameFolder, onDeleteFolder }: SidebarProps) {
  const topLevelNotes = notes.filter((note) => note.folderId === null)
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null)
  const draggedNote = notes.find((note) => note.id === draggedNoteId)
  const { isOver, dropProps } = useNoteDrop(null, draggedNote, (id, folderId) => {
    onMoveNote(id, folderId)
    if (collapsedSections.notes) onToggleSection('notes')
  }, () => setDraggedNoteId(null))
  const newChatActive = activeView === 'chat' && !conversations.some((item) => item.id === activeConversationId)

  return (
    <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-7 overflow-y-auto px-3 pb-5 pt-2 [&_svg]:text-muted-foreground">
      <div className="space-y-1">
        <Button
          variant={activeView === 'home' ? 'secondary' : 'ghost'}
          className="h-10 w-full justify-start gap-3 rounded-xl font-normal"
          aria-current={activeView === 'home' ? 'page' : undefined}
          onClick={onHome}
        >
          <Home aria-hidden="true" />
          Home
        </Button>
        <Button variant={newChatActive ? 'secondary' : 'ghost'}
          className="h-10 w-full justify-start gap-3 rounded-xl font-normal"
          aria-current={newChatActive ? 'page' : undefined} onClick={onNewChat}>
          <SquarePen aria-hidden="true" />
          New chat
        </Button>
        <Button variant="ghost" className="h-10 w-full justify-start gap-3 rounded-xl font-normal" onClick={() => onCreateNote()} disabled={loading || loadError}>
          <Plus aria-hidden="true" />
          New note
        </Button>
        <Button variant="ghost" className="h-10 w-full justify-start gap-3 rounded-xl font-normal" onClick={onCreateFolder} disabled={loading || loadError}>
          <FolderPlus aria-hidden="true" />
          New folder
        </Button>
      </div>
      <SidebarSection title="Chat history" collapsed={collapsedSections.chats} onToggle={() => onToggleSection('chats')}>
        {chatMutationError && <p role="alert" className="px-3 text-sm text-destructive">{chatMutationError}</p>}
        {chatLoading ? (
          <p role="status" className="mt-3 px-3 text-sm text-muted-foreground">Loading chats…</p>
        ) : chatLoadError ? (
          <div className="mt-2 px-3 text-sm text-muted-foreground">
            <p>Chat history unavailable.</p>
            <Button variant="ghost" size="sm" className="mt-1" onClick={onRetryChatLoad}>Retry</Button>
          </div>
        ) : conversations.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {conversations.map((conversation) => (
              <ChatHistoryRow key={conversation.id} conversation={conversation}
                selected={activeView === 'chat' && activeConversationId === conversation.id}
                onSelect={onSelectConversation} onRename={onRenameConversation} onDelete={onDeleteConversation} />
            ))}
          </ul>
        ) : (
          <p className="mt-3 px-3 text-sm text-muted-foreground">No saved chats yet.</p>
        )}
      </SidebarSection>
      <SidebarSection title="Folders" collapsed={collapsedSections.folders} onToggle={() => onToggleSection('folders')}>
        {loading || loadError ? (
          <p className="mt-3 px-3 text-sm text-muted-foreground">{loading ? 'Loading folders…' : 'Folders unavailable.'}</p>
        ) : folders.length === 0 ? (
          <p className="mt-3 px-3 text-sm text-muted-foreground">No folders yet.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {folders.map((folder) => (
              <FolderRow
                key={folder.id} folder={folder} notes={notes.filter((note) => note.folderId === folder.id)}
                selectedNoteId={selectedNoteId} onRename={onRenameFolder} onDelete={onDeleteFolder}
                onCreateNote={onCreateNote} onSelectNote={onSelectNote} onRenameNote={onRenameNote} onDeleteNote={onDeleteNote}
                draggedNote={draggedNote} onDragNote={setDraggedNoteId} onMoveNote={onMoveNote}
              />
            ))}
          </ul>
        )}
      </SidebarSection>
      <SidebarSection title="Notes" collapsed={collapsedSections.notes} onToggle={() => onToggleSection('notes')} {...dropProps}
        className={`rounded-lg ${collapsedSections.notes ? '' : 'min-h-20'} ${isOver ? 'bg-accent ring-2 ring-ring' : ''}`}>
        {loading || loadError ? (
          <p className="mt-3 px-3 text-sm text-muted-foreground">{loading ? 'Loading notes…' : 'Notes unavailable.'}</p>
        ) : topLevelNotes.length === 0 ? (
          <p className="mt-3 px-3 text-sm leading-relaxed text-muted-foreground">
            No top-level notes yet.
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {topLevelNotes.map((note) => (
              <NoteRow
                key={note.id}
                note={note}
                selected={selectedNoteId === note.id}
                onSelect={onSelectNote}
                onRename={onRenameNote}
                onDelete={onDeleteNote}
                onDragNote={setDraggedNoteId}
              />
            ))}
          </ul>
        )}
      </SidebarSection>
    </nav>
  )
}
