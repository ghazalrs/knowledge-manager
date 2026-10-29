# Knowledge retrieval and answers

Ask chat can answer questions across saved notes. You can ask naturally: “What do my notes say about memory?” or “Compare the approaches I saved.” No special search command is needed.

## What RAG means

**Retrieval-augmented generation (RAG)** means finding relevant saved information first, then giving it to the AI as evidence for an answer. The model is not trained on your database and cannot read arbitrary notes by itself.

```text
Question + recent user context
           ↓
Keyword search + semantic search
           ↓
Merged relevant passages
           ↓
AI answer + validated sources
```

## Finding evidence

Keyword search recognizes exact terms; semantic search recognizes related meanings. The retriever combines their ranked positions, rather than comparing incompatible raw scores. A note found by both methods receives a boost.

Short follow-ups can use up to three recent user messages from the same conversation. Explicit topic changes disable that inherited context. The semantic query is bounded to 2,000 UTF-8 bytes, with the latest request first.

Ask receives up to three passages from each of six notes. Long notes can contribute relevant sections without sending their entire body. Organize uses the same retrieval, but receives at most four complete notes with bodies no longer than 16,000 characters. It retains its existing approval and undo protections.

## Sources and insufficient information

The model returns answer text, a support declaration, and source note IDs. The server rejects unknown or duplicated IDs and checks that the support declaration agrees with whether sources were cited. Source titles and evidence excerpts come from the retrieved notes, not model-generated links.

- **Supported:** the model judged the supplied evidence sufficient.
- **Partial:** the notes answer only part of the question; the interface says more information may be needed.
- **None:** no sufficient supporting note information was found. Any general explanation must be clearly distinguished from note facts.

Each answer saves its cited titles, evidence passages, and note fingerprints in chat history. The interface shows only a **Sources** title and note links; opening a source shows its current version. Saved evidence and source-change metadata remain stored but are not displayed. Deleted or unavailable note links are disabled.

Before saving an answer, the server rechecks its cited notes. A concurrent edit or deletion causes a retryable error instead of saving an answer against stale evidence.

## Failures and limitations

Semantic retrieval gets 20 seconds. If it fails, times out, or is busy, chat uses keyword results and displays a limited-search warning. Completed embedding work remains cached. Generation gets a separate 70-second deadline. A failed message can be retried using the same ID.

Ask does not change note or folder content. It does save conversation history and update the derived embedding cache. Both chat modes send note text to OpenAI for indexing and relevant text for generation; API charges apply. Home combines text and semantic matching in its single search bar without generating answers. The current-note assistant keeps its existing behavior.

Retrieval and model judgments are approximate. Validating a citation proves that the source was supplied, not that every claim follows from it. Ranking limits can miss useful notes, and “none” means the current search found insufficient evidence—not that no answer exists anywhere in your collection. Review the saved passages when accuracy matters. Existing chat replies are not retroactively given sources.

## Main files

- [`server/knowledge-retrieval.ts`](../server/knowledge-retrieval.ts): hybrid ranking and bounded evidence.
- [`server/semantic-search.ts`](../server/semantic-search.ts): cached passage embeddings.
- [`server/openai.ts`](../server/openai.ts): evidence prompt and structured-answer validation.
- [`server/chat-api.ts`](../server/chat-api.ts): retrieval, generation, and retry flow.
- [`server/chat-store.ts`](../server/chat-store.ts): answer metadata and source snapshots.
- [`src/components/chat/answer-sources.tsx`](../src/components/chat/answer-sources.tsx): source links and support notices.
