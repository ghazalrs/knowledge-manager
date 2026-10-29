export type SemanticSearchState = { status: 'loading' | 'done' | 'error'; noteIds: string[]; error: string }

// Returning a cleanup function lets React cancel both the debounce and the request.
export function scheduleSemanticSearch(query: string, folderId: string | null, update: (state: SemanticSearchState) => void,
  options: { fetcher?: typeof fetch; delay?: number } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(async () => {
    update({ status: 'loading', noteIds: [], error: '' })
    try {
      if (new TextEncoder().encode(query).length > 2000) throw new Error('Use a shorter query to include related notes (up to 2,000 bytes).')
      const response = await (options.fetcher ?? fetch)('/api/search/semantic', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, folderId }), cache: 'no-store',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(100000)]),
      })
      const body: unknown = await response.json()
      if (!response.ok) throw new Error(typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string' ? body.error : 'Related-note search is unavailable.')
      if (typeof body !== 'object' || body === null || !('results' in body) || !Array.isArray(body.results)
        || body.results.some((item: unknown) => typeof item !== 'object' || item === null || !('noteId' in item) || typeof item.noteId !== 'string')) {
        throw new Error('Related-note search returned an unreadable result.')
      }
      if (!controller.signal.aborted) update({ status: 'done', noteIds: body.results.map((item: { noteId: string }) => item.noteId), error: '' })
    } catch (error) {
      if (!controller.signal.aborted) update({ status: 'error', noteIds: [], error: error instanceof Error ? error.message : 'Could not reach related-note search.' })
    }
  }, options.delay ?? 600)
  return () => { clearTimeout(timer); controller.abort() }
}
