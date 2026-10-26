import { useState } from 'react'
import { PanelLeft, X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { Sidebar } from '@/components/layout/sidebar'
import { DesktopSidebar } from '@/components/layout/desktop-sidebar'
import { NoteView } from '@/components/notes/note-view'
import { WelcomeView } from '@/components/home/welcome-view'
import { ChatView } from '@/components/chat/chat-view'
import { Button } from '@/components/ui/button'
import type { Note } from '@/types/note'
import type { WorkspaceView } from '@/types/chat'
import { useWorkspace } from '@/hooks/use-workspace'
import { useChat } from '@/hooks/use-chat'
import type { SidebarSectionId } from '@/components/layout/sidebar-section'

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [activeView, setActiveView] = useState<WorkspaceView>('home')
  const [collapsedSections, setCollapsedSections] = useState<Record<SidebarSectionId, boolean>>({ chats: false, folders: false, notes: false })
  const {
    messages: chatMessages, draft: chatDraft, attachments: chatAttachments, sending: chatSending, error: chatError,
    setDraft: setChatDraft, sendMessage: sendChatMessage, addAttachments: addChatAttachments,
    removeAttachment: removeChatAttachment, retry: retryChat,
    loading: chatLoading, loadError: chatLoadError, retryLoad: retryChatLoad,
    conversations, activeConversationId, newChat, selectConversation, renameChat, deleteChat, chatMutationError,
    conversationsLoading, conversationsError, retryConversations,
  } = useChat()

  const {
    notes, folders, loading, loadError, saveStatus,
    createNote: addNote, updateNote, deleteNote: removeNote, retryLoad, retrySave,
    createFolder, renameFolder, deleteFolder: removeFolder, moveNote,
  } = useWorkspace()
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const selectedNote = notes.find((note) => note.id === selectedNoteId)

  function createNote(folderId: string | null = null) {
    const id = addNote(folderId)
    if (!id) return
    setSelectedNoteId(id)
    setActiveView('note')
    setMobileOpen(false)
  }

  function renameNote(id: string, title: string) {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) return
    updateNote(id, { title: trimmedTitle })
  }

  function updateNoteContent(id: string, content: Note['content']) {
    updateNote(id, { content })
  }

  function deleteNote(id: string) {
    removeNote(id)
    if (selectedNoteId === id) setActiveView('home')
    setSelectedNoteId((currentId) => currentId === id ? null : currentId)
  }

  function selectNote(id: string) {
    setSelectedNoteId(id)
    setActiveView('note')
    setMobileOpen(false)
  }

  function deleteFolder(id: string) {
    removeFolder(id)
    if (selectedNote?.folderId === id) {
      setSelectedNoteId(null)
      setActiveView('home')
    }
  }

  function goHome() {
    setActiveView('home')
    setSelectedNoteId(null)
    setMobileOpen(false)
  }

  function openChat(id: string) {
    selectConversation(id)
    setActiveView('chat')
    setSelectedNoteId(null)
    setMobileOpen(false)
  }

  function startNewChat() {
    newChat()
    setActiveView('chat')
    setSelectedNoteId(null)
    setMobileOpen(false)
  }

  const sidebarProps = {
    notes,
    folders,
    loading,
    loadError,
    selectedNoteId,
    activeView,
    conversations,
    activeConversationId,
    collapsedSections,
    onToggleSection: (id: SidebarSectionId) => setCollapsedSections((current) => ({ ...current, [id]: !current[id] })),
    chatLoading: conversationsLoading,
    chatLoadError: !!conversationsError,
    onRetryChatLoad: retryConversations,
    onNewChat: startNewChat,
    onSelectConversation: openChat,
    onRenameConversation: renameChat,
    onDeleteConversation: deleteChat,
    chatMutationError,
    onHome: goHome,
    onCreateNote: createNote,
    onSelectNote: selectNote,
    onRenameNote: renameNote,
    onDeleteNote: deleteNote,
    onMoveNote: moveNote,
    onCreateFolder: createFolder,
    onRenameFolder: renameFolder,
    onDeleteFolder: deleteFolder,
  }

  return (
    <div className={`flex bg-background text-foreground ${activeView === 'chat' ? 'h-svh overflow-hidden' : 'min-h-svh'}`}>
      {sidebarOpen && (
        <DesktopSidebar>
          <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-4">
            <span className="text-sm font-medium tracking-tight text-foreground/80">Knowledge Manager</span>
            <Button variant="ghost" size="icon" aria-label="Collapse sidebar" aria-expanded={true} aria-controls="desktop-sidebar" onClick={() => setSidebarOpen(false)}>
              <PanelLeft aria-hidden="true" />
            </Button>
          </div>
          <Sidebar {...sidebarProps} />
        </DesktopSidebar>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 px-4 sm:px-6">
          <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
            <Dialog.Trigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open sidebar">
                <PanelLeft aria-hidden="true" />
              </Button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 md:hidden" />
              <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r bg-sidebar outline-none md:hidden">
                <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-4">
                  <Dialog.Title className="text-sm font-medium tracking-tight text-foreground/80">Knowledge Manager</Dialog.Title>
                  <Dialog.Close asChild>
                    <Button variant="ghost" size="icon" aria-label="Close sidebar"><X aria-hidden="true" /></Button>
                  </Dialog.Close>
                </div>
                <Dialog.Description className="sr-only">Navigate your workspace and browse notes.</Dialog.Description>
                <Sidebar {...sidebarProps} />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          {!sidebarOpen && (
            <Button variant="ghost" size="icon" className="hidden md:inline-flex" aria-label="Expand sidebar" aria-expanded={false} aria-controls="desktop-sidebar" onClick={() => setSidebarOpen(true)}>
              <PanelLeft aria-hidden="true" />
            </Button>
          )}
          {/* {!loading && !loadError && (
            <span role="status" className="ml-auto shrink-0 text-xs text-muted-foreground">
              {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved locally' : 'Unsaved changes'}
            </span>
          )} */}
        </header>
        {loadError && (
          <div role="alert" className="flex flex-wrap items-center gap-3 px-6 py-3 text-sm text-destructive">
            <p>Could not load your notes or folders. Check that the local server is running, then retry.</p>
            <Button variant="outline" onClick={retryLoad}>Retry</Button>
          </div>
        )}
        {saveStatus === 'error' && (
          <div role="alert" className="flex flex-wrap items-center gap-3 px-6 py-3 text-sm text-destructive">
            <p>Changes could not be saved. Keep this page open and retry to save them.</p>
            <Button variant="outline" onClick={retrySave}>Retry save</Button>
          </div>
        )}
        <main className={activeView === 'chat' ? 'flex min-h-0 flex-1 flex-col' : selectedNote ? 'flex-1 px-6 py-8 sm:px-8 sm:py-12' : 'flex-1 px-5 pb-12 pt-4 sm:px-8 sm:pt-6 lg:px-12'}>
          {activeView === 'chat' ? (
            <ChatView key={activeConversationId} messages={chatMessages} draft={chatDraft} attachments={chatAttachments}
              sending={chatSending} error={chatError} onRetry={retryChat}
              loading={chatLoading} loadError={chatLoadError} onRetryLoad={retryChatLoad}
              onDraftChange={setChatDraft} onSend={sendChatMessage}
              onAddAttachments={addChatAttachments} onRemoveAttachment={removeChatAttachment} />
          ) : loading ? <p role="status">Loading workspace…</p> : loadError ? (
            <p className="text-sm text-muted-foreground">Your folders and notes will appear here once the workspace loads.</p>
          ) : selectedNote ? (
            <NoteView
              key={selectedNote.id}
              note={selectedNote}
              folderName={folders.find((folder) => folder.id === selectedNote.folderId)?.name}
              onContentChange={updateNoteContent}
              onRename={renameNote}
            />
          ) : (
            <WelcomeView folders={folders} notes={notes} onOpenNote={selectNote} />
          )}
        </main>
      </div>
    </div>
  )
}

export default App
