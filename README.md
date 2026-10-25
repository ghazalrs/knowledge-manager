# Knowledge Manager

A local-first, AI-powered web application that transforms unstructured information into organized, searchable, and interconnected personal knowledge.

## Features

- **Note Management:** Create, edit, and organize notes into folders.
- **AI Organization:** Clean, summarize, categorize, and integrate information into new or existing notes.
- **AI Chat:** Ask questions and interact with stored knowledge.
- **RAG:** Retrieve relevant information using keyword and semantic search.
- **Knowledge Graph:** Visualize relationships between notes and concepts.
- **Flashcards:** Generate study materials from saved notes.
- **Local Storage:** Store personal knowledge locally without requiring an account.
- **Bring Your Own API Key:** Connect supported AI providers using personal API keys.


## Tech Stack

- **Frontend:** React, TypeScript, Vite
- **UI:** Tailwind CSS, shadcn/ui
- **Editor:** Tiptap
- **Database:** IndexedDB, Dexie.js
- **Search:** Hybrid RAG (keyword and vector search)
- **Knowledge Graph:** React Flow

## Development setup

Requires Node.js 22.12+ (or a newer supported release) and npm.

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

The frontend foundation uses React, TypeScript, Vite, Tailwind CSS, and
shadcn/ui. The current app is a welcome screen; note management, persistence,
and the future features listed above are not implemented yet.

- `src/App.tsx`: application entry component
- `src/index.css`: Tailwind import and theme styles
- `src/components/ui/`: editable shadcn/ui components
- `src/lib/utils.ts`: shared styling helper
- `components.json`: shadcn/ui CLI configuration
- `vite.config.ts`: React/Tailwind plugins and the `@/` alias to `src/`

Add components as needed with `npx shadcn@latest add <component>`.

## Usage

1. Create notes and organize them into folders.
2. Add information manually or through the AI chat.
3. Use AI to clean, summarize, and organize information.
4. Search and ask questions about stored knowledge.
5. Explore connections through the knowledge graph.


## License

License to be determined.