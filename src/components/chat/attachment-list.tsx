import { FileText, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ChatAttachment } from '@/types/chat'

type AttachmentListProps = {
  attachments: ChatAttachment[]
  onRemove?: (id: string) => void
}

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function AttachmentList({ attachments, onRemove }: AttachmentListProps) {
  return (
    <ul aria-label="Attachments" className="flex flex-wrap gap-2">
      {attachments.map(({ id, file }) => (
        <li key={id} className="flex min-w-0 max-w-full items-center gap-2 rounded-xl bg-background/80 px-3 py-2 text-sm">
          <FileText aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <span className="block max-w-44 truncate text-xs font-medium" title={file.name}>{file.name}</span>
            <span className="block text-xs text-muted-foreground">{fileSize(file.size)}</span>
          </span>
          {onRemove && (
            <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove ${file.name}`} onClick={() => onRemove(id)}>
              <X aria-hidden="true" />
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}
