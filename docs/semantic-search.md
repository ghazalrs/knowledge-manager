# How semantic search works

## Current integration status

The semantic search engine runs as a backend service. Ask and Organize use it through the shared [knowledge retriever](knowledge-retrieval.md). It also exposes a local `POST /api/search/semantic` endpoint. Home retains its original local text search; there is no separate semantic-search interface.

The endpoint accepts a JSON body such as `{ "query": "why am I tired?", "folderId": null }` and returns ranked `results` containing `noteId`, `score`, `excerpt`, up to three matching `passages`, and a text `fingerprint`, plus `refreshed` and `searched` counts. An optional folder ID limits indexing and results to that folder. For example, a query about feeling tired can surface a note about sleep even without the word “tired”.

The server uses the existing `OPENAI_API_KEY` from `.env.local` (or its environment). Restart `npm run dev` after backend or configuration changes. No additional package or service needs to be installed.

Calling semantic search, including through chat, sends saved note titles, note text, and the search query to OpenAI. API usage is billed to the configured key. Editing notes alone does not trigger embedding requests. Home text search remains local.

## The data flow

1. A local caller submits a query and optional folder ID to `POST /api/search/semantic`.
2. The server reads saved notes from SQLite and converts Tiptap's structured rich text into plain text. Formatting in the original notes is preserved.
3. Each note's title and body are split into passages of at most 2,000 UTF-8 bytes, with 50 characters of overlap. This conservative byte bound keeps each input small even for non-English text. Overlap helps preserve ideas at passage boundaries.
4. The server checks a SHA-256 hash of the note's current searchable text. A hash is a compact fingerprint: changing the text changes the fingerprint. If the fingerprint and index recipe match the cache, no note embedding request is needed.
5. Missing or changed notes are embedded using `text-embedding-3-small`. A vector is a list of numbers representing meaning. Up to 16 passages are sent per request. Completed notes are cached in the `note_embeddings` table inside `data/knowledge-manager.sqlite`.
6. The query is embedded with the same model. Cosine similarity compares its vector with each passage vector. It measures their direction rather than their magnitude; larger scores mean greater similarity.
7. Each note takes the score of its strongest passage. Results below 0.25 are omitted, and the best 20 notes are returned with a short preview from their strongest passage. The cutoff is an initial heuristic, not a guarantee of relevance.
8. Before returning, the server rechecks note fingerprints and folder membership. Deleted or changed notes are excluded. Future callers should also handle results becoming stale after the response.

## Why these choices

- **Passages instead of whole notes:** a relevant section can surface inside a long note about several topics. The excerpt is the beginning of the matching passage, not an AI-generated summary.
- **SQLite instead of a vector database:** for a personal collection, scanning cached vectors is simple and avoids another dependency. The notes and search cache use the same local database file.
- **Content fingerprints instead of save callbacks:** edits can come from the editor, approved assistant proposals, or undo. Checking actual text catches all of these without changing those features. Folder moves and formatting-only changes do not require new vectors.
- **On-demand indexing:** searches refresh the index before ranking. No background process watches or transmits note edits. Completed notes survive a later provider failure and are reused on retry.
- **No network call inside a database transaction:** SQLite locks stay short, so note editing can continue while embeddings are generated. Each complete note cache entry is written atomically.
- **A versioned index recipe:** the cache records the model and chunking recipe, preventing accidental reuse after those settings change in a future implementation.

## Boundaries and limitations

- Search uses saved content. Unsaved edits are not sent for indexing.
- One semantic request runs at a time to avoid duplicate indexing costs. Other requests receive a retry message.
- The standalone endpoint has a 90-second server deadline. Chat allows 20 seconds for retrieval, then falls back to keyword search with a warning. Very large collections may need multiple requests to finish indexing; completed notes are retained, but an incomplete note must start again.
- Note deletion cascades to its cached vectors. Changed entries are replaced on the next search that includes the note. The cache is derived data; original note content is never changed by searching.
- Query vectors are generated on each submitted search. Only note vectors are persisted.
- Semantic similarity is approximate. The cutoff and ranking need evaluation against real queries; scores are not confidence percentages. Text search remains useful for exact wording.
- This engine finds passages. The chat layer generates answers and validates source references. It does not build a knowledge graph or change the current-note assistant's scope.
- Automated tests use fake vectors and mocked provider responses. They verify mechanics and failure handling without sending personal notes or measuring the real model's retrieval quality.

## Code map

- `server/embeddings.ts`: OpenAI requests, response validation, and safe error messages.
- `server/semantic-search.ts`: passage splitting, fingerprints, SQLite caching, and ranking.
- `server/semantic-api.ts`: local-request checks, input validation, cancellation, and deadlines.
- `tests/semantic-search.test.ts`: ranking, persistence, freshness, concurrency, Unicode, provider failures, and endpoint checks.
