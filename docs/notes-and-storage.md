# Notes and storage

## From typing to saving

1. Tiptap reports an edit as a structured JSON document.
2. React updates the visible note immediately.
3. `useWorkspace` adds the change to a save queue.
4. The queue sends each change to the local server in order.
5. The server validates it and writes it to SQLite.

This immediate screen update is called an **optimistic update**: the interface responds before the database request finishes. It makes typing feel fast, but the save can still fail.

If a request fails, the queue keeps that change and the changes after it. Keep the page open and use **Retry save**. Unsaved browser state is not durable storage and can be lost on reload.

The queue also ensures that creating a folder finishes before a note is saved inside it. There is no separate Save button for ordinary note edits.

## How rich text is stored

A note has an ID, title, content, creation time, and optional folder ID. Content is a tree of paragraphs, headings, lists, text, and formatting marks. SQLite stores this JSON as text, preserving formatting across restarts.

Search and AI helpers extract plain text from that tree. They do not change the stored document simply by reading it.

When an assistant action changes the saved note, the editor accepts the new document without treating it as another typing event. This prevents an unnecessary autosave loop.

## Folders and deletion

Each note belongs to one folder or to the top level (`folderId: null`). Moving it changes only its folder ID.

Folders currently have **one level**. Nested folders are planned, but the current folder model has no parent-folder field.

Deleting a folder also deletes its notes. SQLite enforces this through a **foreign key**: a rule linking a note's folder ID to an existing folder. Its cascade rule deletes dependent notes automatically. There is currently no trash or ordinary delete recovery.

## Persistence boundaries

The database is `data/knowledge-manager.sqlite`, shared by the app's local server. Reopening the app loads saved notes and folders from it. Separate browser tabs do not receive live updates automatically; reload to fetch external changes.

The database is Git-ignored because it contains personal data. Earlier browser-only notes are not migrated automatically.

## Main files

- [`src/hooks/use-workspace.ts`](../src/hooks/use-workspace.ts): workspace state, save queue, retries.
- [`src/components/notes/note-editor.tsx`](../src/components/notes/note-editor.tsx): Tiptap and formatting controls.
- [`server/api.ts`](../server/api.ts): note/folder request validation.
- [`server/notes-store.ts`](../server/notes-store.ts): SQLite storage and folder relationships.

For AI-approved changes, see [proposals and undo](proposals-and-undo.md).
