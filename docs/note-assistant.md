# The note assistant

Open a note and select its Sparkles button to ask questions, request a summary, or propose an edit. The panel sits beside the note on wide screens and stacks with it on narrow screens.

## What it receives

Before sending, the interface waits for workspace saves to finish. For each request, the server loads the selected note's current saved title and text from SQLite.

It sends OpenAI that note, a bounded portion of the panel conversation, and authoritative proposal statuses. It does not retrieve other notes or use the main chat's history.

The distinction matters: the main Ask chat knows its conversation, while this assistant also receives the selected saved note.

## Answers versus edits

For a question such as “What does this paragraph mean?”, the assistant returns an answer. For an explicit request such as “Improve the writing”, it can return an update proposal.

The server validates the response and binds any update to the selected note. The model cannot choose another target or directly write to the database. You review and save changes through the same [proposal system](proposals-and-undo.md) used by Organize.

After Save or Discard succeeds, the interface returns to the note. Saved proposals remain accessible under **Note updates**.

## Undo through conversation

A clear request such as “Undo the last update” goes directly to the stored revision engine, without generating replacement text. The server checks whether a saved assistant update exists and whether undo is still safe.

“How does undo work?” remains a question. Pending or discarded proposals have not changed the note, so there is nothing to undo from them.

Each undo request has a stable ID. If a network retry repeats it, the server returns its recorded result rather than undoing another earlier update.

## What persists

- Closing and reopening the panel preserves its conversation while that note workspace remains mounted.
- Leaving the note or reloading resets panel conversation text; it is not stored as main chat history.
- Proposals and approved revisions are saved in SQLite and can be reopened later.
- Deleting the note also deletes its panel proposals and revisions.

The server currently limits note text and panel conversation text to 50,000 characters each, with at most 19 messages per request. Longer conversations send only a recent portion. AI answers can still be mistaken; review proposed changes before saving.

## Main files

- [`src/components/notes/note-workspace.tsx`](../src/components/notes/note-workspace.tsx): panel visibility, saved proposals, and review view.
- [`src/components/notes/note-assistant-panel.tsx`](../src/components/notes/note-assistant-panel.tsx): conversation, prompts, sending, and retries.
- [`server/chat-api.ts`](../server/chat-api.ts): note-scoped requests and direct undo routing.
- [`server/openai.ts`](../server/openai.ts): answer/update response format.
- [`server/chat-store.ts`](../server/chat-store.ts): saved proposals, statuses, and revisions.
- [`server/note-undo.ts`](../server/note-undo.ts): recognition of explicit undo requests.
