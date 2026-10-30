import { createServer } from 'node:http'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NotesStore } from './notes-store.ts'
import { createNotesApi, isLocalRequest } from './api.ts'
import { createChatApi } from './chat-api.ts'
import { loadChatConfig } from './chat-config.ts'
import { ChatStore } from './chat-store.ts'
import { createEmbedder } from './embeddings.ts'
import { SemanticSearch } from './semantic-search.ts'
import { createSemanticApi } from './semantic-api.ts'
import { createKnowledgeRetriever } from './knowledge-retrieval.ts'
import { createGraphExtractor } from './graph-extraction.ts'
import { GraphStore } from './graph-store.ts'
import { createGraphApi } from './graph-api.ts'
import { FlashcardStore } from './flashcard-store.ts'
import { createFlashcardGenerator } from './flashcard-generation.ts'
import { createFlashcardApi } from './flashcard-api.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
const production = process.argv.includes('--production')
const port = production ? 4173 : 5173
const databasePath = resolve(root, 'data/knowledge-manager.sqlite')
await mkdir(dirname(databasePath), { recursive: true })
const store = new NotesStore(databasePath)
const chatStore = new ChatStore(databasePath)
const config = await loadChatConfig(resolve(root, '.env.local'))
const semanticSearch = new SemanticSearch(databasePath, () => store.loadNotes(), createEmbedder(config.apiKey))
const chatApi = createChatApi({ ...config, retrieve: createKnowledgeRetriever(() => store.loadNotes(), semanticSearch) }, chatStore)
const semanticApi = createSemanticApi(semanticSearch)
const graphStore = new GraphStore(databasePath, () => store.loadNotes(), createGraphExtractor(config), config.model)
const graphApi = createGraphApi(graphStore)
const flashcardStore = new FlashcardStore(databasePath, () => store.loadNotes())
const flashcardApi = createFlashcardApi(flashcardStore, createFlashcardGenerator(config))
const api = createNotesApi(store)
const vite = production ? null : await (await import('vite')).createServer({
  root,
  server: { middlewareMode: true },
  appType: 'spa',
})
const dist = resolve(root, 'dist')
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.json': 'application/json',
}

const server = createServer(async (request, response) => {
  if (!isLocalRequest(request)) { response.writeHead(403).end('Local app requests only'); return }
  const path = request.url?.split('?')[0]
  if (path === '/api/flashcards' || path?.startsWith('/api/flashcards/')) { await flashcardApi(request, response); return }
  if (path === '/api/graph' || path?.startsWith('/api/graph/')) { await graphApi(request, response); return }
  if (path === '/api/search/semantic') { await semanticApi(request, response); return }
  if (path === '/api/chat' || path?.startsWith('/api/chat/')) { await chatApi(request, response); return }
  if (request.url?.split('?')[0].startsWith('/api/')) { await api(request, response); return }
  if (vite) { vite.middlewares(request, response); return }
  if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405).end(); return }
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
    const file = resolve(dist, `.${pathname === '/' ? '/index.html' : pathname}`)
    if (!file.startsWith(dist + sep)) { response.writeHead(403).end(); return }
    const content = await readFile(file)
    response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' })
    response.end(request.method === 'HEAD' ? undefined : content)
  } catch {
    response.writeHead(404).end('File not found. Run npm run build before previewing.')
  }
})

let closing = false
async function shutdown(code = 0) {
  if (closing) return
  closing = true
  server.close()
  server.closeAllConnections()
  await vite?.close()
  store.close()
  chatStore.close()
  semanticSearch.close()
  graphStore.close()
  flashcardStore.close()
  process.exit(code)
}
server.on('error', (error) => {
  console.error(`Could not start the local server on port ${port}:`, error.message)
  void shutdown(1)
})
process.once('SIGINT', () => { void shutdown() })
process.once('SIGTERM', () => { void shutdown() })
server.listen(port, '127.0.0.1', () => {
  console.log(`Knowledge Manager: http://localhost:${port}`)
  console.log(`Database: ${databasePath}`)
})
