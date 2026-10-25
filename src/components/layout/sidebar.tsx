import { Home } from 'lucide-react'
import { Button } from '@/components/ui/button'

type SidebarProps = {
  onHome?: () => void
}

export function Sidebar({ onHome }: SidebarProps) {
  return (
    <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-8 overflow-y-auto p-3">
      <Button
        variant="secondary"
        className="h-10 w-full justify-start gap-3"
        aria-current="page"
        onClick={onHome}
      >
        <Home aria-hidden="true" />
        Home
      </Button>
      <section aria-labelledby="notes-heading" className="px-3">
        <h2 id="notes-heading" className="text-xs font-semibold text-muted-foreground">Notes</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Your notes and folders will appear here.
        </p>
      </section>
    </nav>
  )
}
