# Proposals and undo

A **proposal** is a suggested note change stored separately from the note. Generating it does not alter note content. Both Organize chat and the note assistant use this review process.

## Review flow

1. The model returns structured fields describing a suggested change.
2. The server validates those fields and the target note.
3. The interface displays a preview. For updates, the original is read-only and the proposed version is editable.
4. **Save** applies the reviewed version. **Discard** leaves the note unchanged.

Organize may propose a new note or an update to one retrieved note. New notes are saved at the top level. The contextual assistant can only propose updating its selected note.

## Proposal states

| State | Meaning | Next action |
| --- | --- | --- |
| Pending | Waiting for review; note unchanged | Save or Discard |
| Discarded | Rejected; note unchanged | Try again reopens the same preview |
| Saved | Applied to the database | Saved updates can be undone |
| Undone | Previous version restored | Submit a new request for further changes |

**Try again does not call the AI again.** It restores the same discarded preview, including its saved draft and original comparison.

## Preventing overwritten edits

An update proposal carries a snapshot of the original note. Before approval, the server compares that snapshot with the current saved note. If the note changed or was deleted, approval fails and the user must request a fresh proposal.

This is **optimistic concurrency control**: work can happen without locking the note during generation, but saving checks that the original is still current.

Saving an update records before-and-after snapshots in `note_revisions`. The note, revision, and proposal status change inside one database transaction. A transaction means all changes succeed together or are rolled back together.

## What Undo does

Undo restores the saved original title and rich-text content. It does not ask the model to recreate the old wording.

The current note must still match the recorded version after approval. Later edits or a folder move can block undo so it cannot overwrite newer work. Repeated Save or Undo requests are handled without applying the same change twice; this is called **idempotency**.

Undo here applies to approved updates, not newly created notes, manual typing, or ordinary note deletion.

## Main files

- [`src/components/chat/note-proposal-card.tsx`](../src/components/chat/note-proposal-card.tsx): review controls and comparison.
- [`server/openai.ts`](../server/openai.ts): proposal generation and target validation.
- [`server/chat-store.ts`](../server/chat-store.ts): proposal states, transactions, snapshots, and undo.
- [`server/note-document.ts`](../server/note-document.ts): supported rich-text validation.

See [the note assistant](note-assistant.md) for conversational undo requests.
