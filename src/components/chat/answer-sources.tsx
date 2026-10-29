import type { KnowledgeAnswer } from '@/types/chat'
import { Button } from '@/components/ui/button'

type Props = { knowledge: KnowledgeAnswer; showSupport: boolean; noteIds: Set<string>; onOpenNote: (id: string) => void }

export function AnswerSources({ knowledge, showSupport, noteIds, onOpenNote }: Props) {
  return <div className="mt-3 space-y-3 text-xs leading-5 text-muted-foreground">
    {knowledge.warning && <p role="status" className="rounded-xl bg-muted px-3 py-2">{knowledge.warning}</p>}
    {showSupport && knowledge.support !== 'supported' && <p>{knowledge.support === 'partial'
      ? 'Saved notes provide only part of the answer. Other information may be needed.'
      : 'No sufficient supporting information was found in your saved notes. Any general explanation is separate from your notes.'}</p>}
    {knowledge.sources.length > 0 && <section aria-label="Answer sources" className="rounded-xl border border-border p-3">
      <p className="font-medium text-foreground">Sources</p>
      <ul className="mt-2 space-y-2">
        {knowledge.sources.map((source) => {
          const deleted = source.state === 'deleted' || !noteIds.has(source.noteId)
          return <li key={source.noteId}>
            <Button type="button" variant="link" size="sm" className="h-auto max-w-full justify-start whitespace-normal p-0 text-left text-xs"
              disabled={deleted} onClick={() => onOpenNote(source.noteId)}>{source.title}</Button>
          </li>
        })}
      </ul>
    </section>}
  </div>
}
