import { useState, type DragEvent } from 'react'
import type { Note } from '@/types/note'

export const NOTE_DRAG_TYPE = 'application/x-knowledge-manager-note'

export function useNoteDrop(
  folderId: string | null,
  draggedNote: Note | undefined,
  onMove: (id: string, folderId: string | null) => void,
  onFinish: () => void,
) {
  const [over, setOver] = useState(false)
  const canDrop = !!draggedNote && draggedNote.folderId !== folderId

  return {
    isOver: canDrop && over,
    dropProps: {
      onDragOver(event: DragEvent<HTMLElement>) {
        if (!canDrop || !event.dataTransfer.types.includes(NOTE_DRAG_TYPE)) return
        event.preventDefault()
        event.stopPropagation()
        event.dataTransfer.dropEffect = 'move'
        setOver(true)
      },
      onDragLeave(event: DragEvent<HTMLElement>) {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setOver(false)
      },
      onDrop(event: DragEvent<HTMLElement>) {
        event.preventDefault()
        event.stopPropagation()
        setOver(false)
        const id = event.dataTransfer.getData(NOTE_DRAG_TYPE)
        if (canDrop && id === draggedNote?.id) onMove(id, folderId)
        onFinish()
      },
    },
  }
}
