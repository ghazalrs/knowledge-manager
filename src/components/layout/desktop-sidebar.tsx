import { useEffect, useRef, useState, type ReactNode } from 'react'

const MIN_WIDTH = 220
const DEFAULT_WIDTH = 256
const MAX_WIDTH = 480
const STORAGE_KEY = 'knowledge-manager.sidebar-width'
const clamp = (width: number, maximum = MAX_WIDTH) => Math.max(MIN_WIDTH, Math.min(maximum, width))

function savedWidth() {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    const width = Number(value)
    return value && Number.isFinite(width) ? clamp(width) : DEFAULT_WIDTH
  } catch { return DEFAULT_WIDTH }
}

export function DesktopSidebar({ children }: { children: ReactNode }) {
  const [width, setWidth] = useState(savedWidth)
  const [viewport, setViewport] = useState(() => window.innerWidth)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ pointerId: number; x: number; width: number } | null>(null)
  const maximum = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, viewport - 360))
  const visibleWidth = clamp(width, maximum)

  useEffect(() => {
    const resize = () => setViewport(window.innerWidth)
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  useEffect(() => {
    if (dragging) return
    try { localStorage.setItem(STORAGE_KEY, String(width)) } catch { /* Resizing still works when storage is unavailable. */ }
  }, [width, dragging])

  useEffect(() => {
    if (!dragging) return
    const { cursor, userSelect } = document.body.style
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.body.style.cursor = cursor
      document.body.style.userSelect = userSelect
    }
  }, [dragging])

  function finishDrag() {
    drag.current = null
    setDragging(false)
  }

  return (
    <aside id="desktop-sidebar" aria-label="Sidebar"
      style={{ width: visibleWidth }}
      className="sticky top-0 hidden h-svh shrink-0 flex-col border-r border-sidebar-border/60 bg-sidebar md:flex">
      {children}
      <div role="separator" tabIndex={0} aria-label="Resize sidebar" aria-orientation="vertical"
        aria-controls="desktop-sidebar" aria-valuemin={MIN_WIDTH} aria-valuemax={maximum} aria-valuenow={visibleWidth}
        aria-valuetext={`${visibleWidth} pixels`} title="Drag to resize; use arrow keys when focused"
        className={`absolute inset-y-0 -right-1 z-20 w-2 touch-none cursor-col-resize outline-none transition-colors hover:bg-sidebar-border focus-visible:bg-ring ${dragging ? 'bg-sidebar-border' : ''}`}
        onPointerDown={(event) => {
          if (event.button !== 0 || !event.isPrimary) return
          event.preventDefault()
          event.currentTarget.focus()
          event.currentTarget.setPointerCapture(event.pointerId)
          drag.current = { pointerId: event.pointerId, x: event.clientX, width: visibleWidth }
          setDragging(true)
        }}
        onPointerMove={(event) => {
          const start = drag.current
          if (start?.pointerId === event.pointerId) setWidth(clamp(start.width + event.clientX - start.x, maximum))
        }}
        onPointerUp={(event) => {
          if (drag.current?.pointerId !== event.pointerId) return
          finishDrag()
          event.currentTarget.releasePointerCapture(event.pointerId)
        }}
        onPointerCancel={finishDrag} onLostPointerCapture={finishDrag}
        onDoubleClick={() => setWidth(DEFAULT_WIDTH)}
        onKeyDown={(event) => {
          let next: number
          if (event.key === 'ArrowLeft') next = visibleWidth - 16
          else if (event.key === 'ArrowRight') next = visibleWidth + 16
          else if (event.key === 'Home') next = MIN_WIDTH
          else if (event.key === 'End') next = maximum
          else return
          event.preventDefault()
          setWidth(clamp(next, maximum))
        }} />
    </aside>
  )
}
