import { useEffect, useId, useRef } from 'react'
import { ArrowUp, LoaderCircle, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ChatAttachment, ChatMessage, ChatMode } from '@/types/chat'
import { NoteProposalCard } from '@/components/chat/note-proposal-card'
import { AttachmentList } from '@/components/chat/attachment-list'

type ChatViewProps = {
  messages: ChatMessage[]
  draft: string
  attachments: ChatAttachment[]
  sending: boolean
  error: string
  loading: boolean
  loadError: string
  onRetryLoad: () => void
  onRetry: () => void
  onAddAttachments: (files: File[]) => void
  onRemoveAttachment: (id: string) => void
  onDraftChange: (value: string) => void
  onSend: () => void
  mode: ChatMode
  onModeChange: (mode: ChatMode) => void
  proposalSaveDisabled: boolean
  onRetryProposal: (id: string) => Promise<void>
  onResolveProposal: (id: string, action: 'save' | 'discard' | 'undo' | 'reopen', title?: string, content?: string, document?: import('@/types/note').Note['content']) => Promise<void>
}

export function ChatView({ messages, draft, attachments, sending, error, loading, loadError, onRetryLoad, onRetry, onAddAttachments, onRemoveAttachment, onDraftChange, onSend, mode, onModeChange, proposalSaveDisabled, onResolveProposal, onRetryProposal }: ChatViewProps) {
  const textarea = useRef<HTMLTextAreaElement>(null)
  const messageList = useRef<HTMLDivElement>(null)
  const composerId = useId()
  const fileInputId = useId()
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const list = messageList.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages.length, sending])

  useEffect(() => {
    if (!textarea.current) return
    textarea.current.style.height = 'auto'
    textarea.current.style.height = `${Math.min(textarea.current.scrollHeight, 192)}px`
  }, [draft])

  return (
    <section aria-label="Chat" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="mx-auto flex w-full max-w-3xl shrink-0 flex-col items-center gap-2 px-5 pb-3 text-center sm:px-6">
        <div role="group" aria-label="Chat mode" className="flex rounded-full bg-muted p-1">
          {(['ask', 'organize'] as const).map((value) => <Button key={value} type="button" size="sm"
            variant={mode === value ? 'secondary' : 'ghost'} className="rounded-full" aria-pressed={mode === value}
            disabled={sending || loading || !!loadError} onClick={() => onModeChange(value)}>{value === 'ask' ? 'Ask' : 'Organize'}</Button>)}
        </div>
        <p className="text-xs text-muted-foreground">{mode === 'ask' ? 'Explore ideas and ask questions.' : 'Find related notes and propose changes for your approval.'}</p>
      </div>
      <div ref={messageList} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6">
        {loading ? <p role="status" className="mx-auto max-w-3xl py-8 text-sm text-muted-foreground">Loading chat history…</p>
        : loadError ? <p className="mx-auto max-w-3xl py-8 text-sm text-muted-foreground">Retry below to restore your saved conversation.</p>
        : messages.length === 0 ? (
          <div className="mx-auto flex h-full min-h-48 w-full max-w-xl flex-col items-center justify-center pb-8 text-center">
            <h2 className="text-2xl font-medium tracking-tight sm:text-3xl">What’s on your mind?</h2>
            <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">Capture a thought, ask a question, or paste something you want to explore.</p>
          </div>
        ) : (
          <ol role="log" aria-label="Chat messages" aria-live="polite" aria-relevant="additions" className={`mx-auto w-full space-y-5 py-4 ${messages.some((message) => message.proposal?.action === 'update') ? 'max-w-6xl' : 'max-w-3xl'}`}>
            {messages.map((message) => (
              <li key={message.id} className={`mx-auto flex w-full ${message.proposal?.action === 'update' ? 'max-w-6xl' : 'max-w-3xl'} ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={message.role === 'user'
                  ? 'max-w-[90%] rounded-2xl rounded-br-md bg-muted/75 px-4 py-3 text-sm leading-7 sm:max-w-[80%] sm:px-5'
                  : 'w-full min-w-0 px-1 py-3 text-sm leading-7'}>
                  {message.role === 'user' ? <span className="sr-only">You: </span>
                    : <p className="mb-1 text-xs font-medium text-muted-foreground"></p>}
                  {message.attachments.length > 0 && (
                    <div className={message.content ? 'mb-2' : ''}><AttachmentList attachments={message.attachments} /></div>
                  )}
                  {message.content && message.proposal?.action !== 'update' && <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.content}</p>}
                  {message.role === 'user' && message.mode === 'organize' && <p className="mt-1 text-xs text-muted-foreground">Organize</p>}
                  {message.proposal && <NoteProposalCard key={`${message.id}-${message.proposal.status}`} proposal={message.proposal} disabled={proposalSaveDisabled}
                    retryDisabled={proposalSaveDisabled || sending || loading || !!loadError} onRetry={() => onRetryProposal(message.id)}
                    onResolve={(action, title, content, document) => onResolveProposal(message.id, action, title, content, document)} />}
                </div>
              </li>
            ))}
          </ol>
        )}
        {sending && (
          <p role="status" className="mx-auto flex w-full max-w-3xl items-center gap-2 py-4 text-sm text-muted-foreground">
            <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" /> Thinking…
          </p>
        )}
      </div>
      <div className="mx-auto w-full max-w-3xl shrink-0 px-5 pb-4 pt-4 sm:px-6 sm:pb-5">
        {loadError && (
          <div role="alert" className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-destructive/5 p-3 text-sm">
            <p className="min-w-0 flex-1 text-destructive">{loadError}</p>
            <Button type="button" variant="outline" onClick={onRetryLoad}>Retry history</Button>
          </div>
        )}
        {error && (
          <div role="alert" className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-destructive/5 p-3 text-sm">
            <p className="min-w-0 flex-1 text-destructive">{error}</p>
            <Button type="button" variant="outline" onClick={onRetry} disabled={sending}>Retry reply</Button>
          </div>
        )}
        <form className="relative rounded-3xl bg-muted/65 p-2.5 focus-within:ring-2 focus-within:ring-ring"
          onSubmit={(event) => {
            event.preventDefault()
            onSend()
            textarea.current?.focus({ preventScroll: true })
          }}>
          {attachments.length > 0 && (
            <div className="mb-2 max-h-32 overflow-y-auto p-1">
              <AttachmentList attachments={attachments} onRemove={onRemoveAttachment} />
            </div>
          )}
          <input ref={fileInput} id={fileInputId} type="file" multiple hidden aria-label="Choose files to attach"
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? [])
              if (files.length > 0) onAddAttachments(files)
              event.currentTarget.value = ''
              textarea.current?.focus({ preventScroll: true })
            }} />
          <label htmlFor={composerId} className="sr-only">Message</label>
          <textarea ref={textarea} id={composerId} value={draft} rows={1}
            placeholder={mode === 'ask' ? 'Write a message…' : 'Paste information to organize…'}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                event.currentTarget.form?.requestSubmit()
              }
            }}
            className="block max-h-48 min-h-10 w-full resize-none overflow-y-auto bg-transparent px-12 py-2 text-sm leading-6 outline-none placeholder:text-muted-foreground" />
            <Button type="button" variant="ghost" size="icon-lg" className="absolute bottom-2.5 left-2.5 rounded-full"
              aria-label="Attach files" aria-controls={fileInputId} title="Attach files" onClick={() => fileInput.current?.click()}>
              <Plus aria-hidden="true" className="size-5" />
            </Button>
            <Button type="submit" size="icon-lg" className="absolute right-2.5 bottom-2.5 rounded-full" aria-label="Send message" disabled={loading || !!loadError || sending || (!draft.trim() && attachments.length === 0)}>
              <ArrowUp aria-hidden="true" />
            </Button>
        </form>
        <p className="mt-2 px-2 text-center text-xs leading-5 text-muted-foreground">{mode === 'organize' ? 'Organize sends your message and matching note text to OpenAI. Changes need your approval.' : 'Text history is saved on this computer. Only text is sent to OpenAI; files stay in this session.'}</p>
      </div>
    </section>
  )
}
