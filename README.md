# Knowledge Manager

A local-first, AI-powered web application that transforms unstructured information into organized, searchable, and interconnected personal knowledge.

## Features

- **Note Management:** Create, edit, and organize notes into folders.
- **AI Organization:** Review and approve proposals to create or update notes, using keyword and semantic retrieval to find related notes.
- **AI Chat:** Ask across saved notes, inspect linked sources, and keep conversation history locally.
- **Note Assistant:** Ask about the current note, review suggested edits, and undo approved updates.
- **Semantic Search:** Cache embeddings locally and retrieve related ideas inside chat.
- **Local Storage:** Store personal knowledge locally without requiring an account.
- **Bring Your Own API Key:** Configure an OpenAI API key on the local server.

Nested folders, knowledge graphs, and flashcards are planned.


## Tech Stack

- **Frontend:** React, TypeScript, Vite
- **UI:** Tailwind CSS, shadcn/ui
- **Editor:** Tiptap
- **Backend and Database:** Local Node.js server and SQLite
- **Search:** Local text search and hybrid keyword/semantic retrieval for chat

## Development setup

Requires Node.js 22.13+ (or a newer supported release) and npm.

```bash
npm install
npm run dev
```

Open the local URL displayed in the terminal.

```bash
npm run build    # Type-check and create the production build
npm run lint     # Run Oxlint
npm run preview  # Serve the production build locally
```

## Usage

1. Create notes and organize them into folders.
2. Add information manually or through the AI chat.
3. Use AI to clean, summarize, and organize information.
4. Search notes by text, or open a note's assistant to ask about its content.
5. Use Ask chat to compare information across notes and open the sources below its answers.

## How it works

Start with the architecture guide, then read the feature you want to understand:

- [Architecture](docs/architecture.md): how the browser, server, database, and AI fit together.
- [Notes and storage](docs/notes-and-storage.md): rich text, autosave, folders, and persistence.
- [AI chat](docs/ai-chat.md): modes, history, retries, configuration, and retrieval.
- [Proposals and undo](docs/proposals-and-undo.md): approval, original snapshots, and safe restoration.
- [Note assistant](docs/note-assistant.md): questions and edits scoped to the current note.
- [Semantic search](docs/semantic-search.md): embeddings, caching, and similarity ranking.
- [Knowledge retrieval and answers](docs/knowledge-retrieval.md): hybrid retrieval, source validation, and evidence limitations.


## License

License to be determined.
