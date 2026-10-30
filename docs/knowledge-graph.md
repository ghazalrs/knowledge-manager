# Knowledge graph

Open **Knowledge graph** in the sidebar to explore connections between notes and concepts. A concept is an idea such as “Memory” or “Spaced repetition”.

## Exploring the note map

Every card is a saved note. Dashed lines suggest notes that discuss the same extracted idea. Solid lines are connections you kept or created yourself.

1. Choose a note with **Browse notes** or search by title or shared idea.
2. Read **Why explore next?** to see related notes and their shared topics.
3. Select **Why?** or a line to inspect the connection. **Sources** opens the original notes; **Evidence** expands supporting excerpts.
4. Click a nearby note to continue your trail. Use **Back** or breadcrumbs to return.

The focused view shows up to six related notes on desktop and three on narrow screens. Paging reveals the rest. Kept connections appear first, followed by suggestions with more shared ideas. Notes without connections are still available through search, Browse notes, and Overview.

In a connection's details, **Keep connection** saves it and **Dismiss** hides it. **Unkeep** removes your saved choice; a shared-topic suggestion may remain. Expand **Dismissed connections** to restore a suggestion. Use **Link a note** to create your own connection. These choices are saved in the local SQLite database and shared across browsers; Refresh loads changes made elsewhere.

Click a shared-idea chip in a connection's details to see the notes discussing that idea. **Overview** shows the collection; selecting a note returns to focused exploration. These two ways of browsing let you follow a note trail or inspect a shared topic.

Drag the canvas to pan, zoom, or fit the displayed map. Nodes can be dragged temporarily. The browser remembers the last focused note and viewport. On narrow screens, details appear beneath the canvas.

## What a connection means

A suggestion means **both notes discuss the same concept name**. It does not mean they agree, have the same meaning, or support a causal claim. Concept names match after Unicode, case, and whitespace normalization; synonyms can remain separate.

Concepts explain note-to-note connections rather than appearing as separate cards. Existing concept-to-concept relationships remain cached but are not drawn in this note map. Suggestions use the existing concept cache without another AI request. Obvious incidental labels such as weekdays and generic headings are excluded. Future extraction also asks for reusable subject-matter concepts instead of schedule slots or filler.

A kept connection survives note edits, but stale extracted evidence is removed. If no current shared evidence remains, it is described simply as **You linked these notes**. Deleting a note removes its saved connection choices. Direct links are map metadata; they do not insert links into note text.

## How extraction works

1. Opening the graph waits for workspace saves, then reads the cached graph from the local server.
2. The server groups overlapping passages into roughly 8 KB portions. Internal overlap is removed so each portion is a continuous substring of the original note, without artificial separators or repeated boundaries.
3. The configured OpenAI model returns up to 12 concepts and 16 relationships for that portion. Each item must include a short supporting quote.
4. The response schema enforces array and text-length limits. The server also checks relationship endpoints, rejects duplicate/self connections, and verifies quotes against both the supplied portion and the original note. Invalid output gets one correction attempt with specific validation feedback; unsupported quotes are never accepted. It creates graph IDs itself.
5. Each completed portion is cached in `note_graph_chunks` in the existing SQLite database. The client requests the next missing portion until processing finishes, showing progress as it goes.

A **fingerprint** identifies the note's searchable text. Changed text invalidates its old extraction; unchanged text is reused across restarts. The cache also records the model and extraction recipe so incompatible results are not reused. Moving a note between folders does not require extraction again.

Concept labels are normalized for Unicode representation, case, and whitespace. “Memory” and “memory” share a node. Synonyms such as “Recall” and “Memory” may remain separate, and ambiguous identical labels can be merged. There is no automatic semantic identity resolution yet.

## Data, failures, and freshness

The graph uses the same `OPENAI_API_KEY` and `OPENAI_MODEL` configuration as chat. Opening it automatically sends uncached saved note text to OpenAI; API charges apply. Notes themselves are never rewritten by graph extraction.

Each portion has a 60-second server deadline, including any correction attempt. Provider failures are not automatically retried. Leaving the view cancels further requests; already completed work remains cached. A failed request stops processing and exposes **Retry** with a specific validation reason when applicable. Cached connections remain available. Only one extraction runs at a time.

Before caching a result, the server checks that its note still exists and has the same fingerprint. Changed notes immediately lose their old connections in a fresh snapshot. Deleting a note deletes its graph cache; concepts without remaining evidence disappear. **Refresh** reloads current saved data and continues missing extraction. Changes from other browsers require a refresh; there is no live cross-browser subscription.

## Limits

Quoted evidence establishes that text exists, not that the model's relationship interpretation is correct. Review the evidence, especially for uncertain or conflicting claims. Relationships are extracted within portions; connections stated only across distant passages may be missed.

Processing is incremental. A partially built graph is not a complete map of the collection. Large collections may take many requests; search can help choose a starting note. Graph layout is a simple deterministic arrangement rather than a semantic-distance map: proximity on screen does not measure similarity.

Semantic similarity ranking, synonym merging, and graph-based chat retrieval are not part of this note map. Suggestions currently require a shared extracted concept name.

## Main files

- [`server/graph-extraction.ts`](../server/graph-extraction.ts): provider prompt, schema, and output validation.
- [`server/graph-store.ts`](../server/graph-store.ts): chunk cache, freshness, and graph assembly.
- [`server/graph-api.ts`](../server/graph-api.ts): local graph reads and one-step refresh requests.
- [`src/hooks/use-knowledge-graph.ts`](../src/hooks/use-knowledge-graph.ts): view lifecycle and progress/error state.
- [`src/lib/graph-api.ts`](../src/lib/graph-api.ts): sequential requests, validation, and cancellation.
- [`src/lib/note-graph.ts`](../src/lib/note-graph.ts): shared-concept suggestions and saved connection choices.
- [`src/lib/graph.ts`](../src/lib/graph.ts): neighborhood selection, search, layout, and saved-view validation.
- [`src/components/graph/`](../src/components/graph/): React Flow canvas, selection details, and note navigation.

The graph JavaScript loads on demand. React Flow supplies the interactive canvas; the app supplies the extracted data, layout, and evidence controls.
