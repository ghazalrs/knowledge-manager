import { useId, type HTMLAttributes, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

export type SidebarSectionId = 'chats' | 'folders' | 'notes'

type SidebarSectionProps = {
  title: string
  collapsed: boolean
  onToggle: () => void
  children: ReactNode
} & HTMLAttributes<HTMLElement>

export function SidebarSection({ title, collapsed, onToggle, children, className, ...props }: SidebarSectionProps) {
  const headingId = useId()
  const contentId = useId()
  return (
    <section {...props} aria-labelledby={headingId} className={className}>
      <h2 id={headingId}>
        <button type="button" aria-expanded={!collapsed} aria-controls={contentId} onClick={onToggle}
          className="flex h-8 w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-medium text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
          {collapsed ? <ChevronRight aria-hidden="true" className="size-3.5" /> : <ChevronDown aria-hidden="true" className="size-3.5" />}
          {title}
        </button>
      </h2>
      <div id={contentId} hidden={collapsed}>{children}</div>
    </section>
  )
}
