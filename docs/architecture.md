# Application architecture

Knowledge Manager has three main parts:

```text
Browser: React interface
        ↕ local HTTP requests
Node.js server
        ↕ database reads and writes
data/knowledge-manager.sqlite
```

## What each part does

- **React** displays notes, folders, chats, and the assistant. React state holds the browser's current view of the data.
- **TypeScript** checks that values have the expected shapes before the app is built.
- **Tailwind CSS and UI components** provide styling and reusable controls.
- **Tiptap** handles rich-text editing.
- **Node.js** validates requests, accesses saved data, and calls the AI provider. The browser never accesses SQLite directly.
- **SQLite** stores the data in one local file. Different browsers on this computer use that same file through the server.
- **Vite** serves frontend code during development and builds it for production.

## Starting the app

Use Node.js 22.13 or newer. `npm run dev` starts the local server and Vite together at `http://localhost:5173`. Frontend changes can appear without restarting; backend changes require a restart.

`npm run build` checks types and builds the frontend into `dist/`. `npm run preview` serves that build at `http://localhost:4173`, using the same database.

The server listens only on this computer's loopback address. It also checks the request's host and origin to reject unrelated web pages. This is a single-user app with no accounts or cloud synchronization.

## Local data and AI

Notes and chat records are stored locally. AI requests still send the necessary text to OpenAI. The API key stays on the server, loaded from `.env.local` or environment variables.

Saving a note does not require an AI call. This separation keeps ordinary editing independent of the provider.

## Where to look

| File or directory | Responsibility |
| --- | --- |
| [`src/App.tsx`](../src/App.tsx) | Select views and connect workspace features |
| [`src/components/`](../src/components/) | Display the interface |
| [`src/hooks/`](../src/hooks/) | Manage browser state and requests |
| [`src/lib/`](../src/lib/) | API clients and shared helpers |
| [`server/index.ts`](../server/index.ts) | Start the server and route requests |
| [`server/api.ts`](../server/api.ts) | Validate note/folder requests |
| [`server/notes-store.ts`](../server/notes-store.ts) | Store notes and folders |
| [`server/chat-store.ts`](../server/chat-store.ts) | Store chats, proposals, and revisions |
| [`server/graph-store.ts`](../server/graph-store.ts) | Cache extracted concepts and assemble the knowledge graph |
| [`tests/`](../tests/) | Check behavior using Node's test runner |

Continue with [notes and storage](notes-and-storage.md), [AI chat](ai-chat.md), [semantic search](semantic-search.md), or [the knowledge graph](knowledge-graph.md).
