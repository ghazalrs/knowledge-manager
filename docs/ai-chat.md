# AI chat

## Two modes

| Mode | Current behavior |
| --- | --- |
| **Ask** | Retrieves relevant saved-note passages and answers with source links. It does not change notes. |
| **Organize** | Uses submitted text and related saved notes to propose creating or updating one note. Saving requires approval. |

For example, “What do my notes say about spaced repetition?” in Ask gets an answer with supporting sources when available. Submitting study material in Organize produces a note preview to review.

## A message's journey

1. The browser gives the message a unique ID and sends its text, mode, and conversation ID to the local server.
2. The server saves the user message in SQLite before requesting a reply.
3. It selects a bounded portion of that conversation as model context: the text the AI receives for this request.
4. It retrieves relevant notes, calls OpenAI, and saves the completed reply and any validated source snapshots locally.
5. The browser displays the reply in the originating conversation, even if another chat is now open.

History is separate for each conversation. Long conversations remain saved, but older messages can fall outside the model's context. Saved history and model memory are therefore different things.

If a request fails, Retry reuses its message ID. The server can return an already-saved reply instead of creating a duplicate. One reply runs at a time per conversation; separate conversations can progress independently.

## How chat finds existing notes

The shared retriever combines keyword ranking with semantic similarity. Keywords capture exact words and phrases; embeddings capture related meanings. Short follow-ups can reuse recent user topics from the same conversation. Explicit topic switches do not inherit them.

Ask receives up to three passages from each of six notes, including relevant sections of long notes. Organize receives up to four complete notes, excluding bodies longer than 16,000 characters. This helps avoid replacing a note using an incomplete original.

Answers include validated source links and saved evidence. Partial or missing support is labeled. If semantic search fails, chat falls back to keyword search and shows a warning. See [knowledge retrieval](knowledge-retrieval.md) for details.

## Configuration and data

Set `OPENAI_API_KEY` and optionally `OPENAI_MODEL` in `.env.local`, then restart the server. Local file settings take precedence over inherited environment settings. The key is not sent to the browser.

Both modes send saved note text to OpenAI for embedding updates, plus conversation and relevant note text for generation. Unchanged note embeddings are reused locally. API charges apply. Generating chat titles also uses an AI request. Manual title changes are preserved.

Attachment controls currently hold files in browser memory; attachment contents are not sent to the model or persisted in chat history.

## Main files

- [`src/hooks/use-chat.ts`](../src/hooks/use-chat.ts): chat sessions, sending, retrying, and navigation.
- [`server/chat-api.ts`](../server/chat-api.ts): requests and conversation context.
- [`server/chat-store.ts`](../server/chat-store.ts): saved history and proposals.
- [`server/related-notes.ts`](../server/related-notes.ts): keyword retrieval.
- [`server/knowledge-retrieval.ts`](../server/knowledge-retrieval.ts): shared hybrid retrieval.
- [`server/openai.ts`](../server/openai.ts): provider requests and reply validation.
- [`server/chat-config.ts`](../server/chat-config.ts): server configuration.

See [proposals and undo](proposals-and-undo.md) for how Organize changes become saved notes.
