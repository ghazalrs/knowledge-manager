import { readFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'

export async function loadChatConfig(path: string, environment: NodeJS.ProcessEnv = process.env) {
  let local: Record<string, string | undefined> = {}
  try { local = parseEnv(await readFile(path, 'utf8')) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  return {
    apiKey: local.OPENAI_API_KEY ?? environment.OPENAI_API_KEY,
    model: local.OPENAI_MODEL?.trim() || environment.OPENAI_MODEL?.trim() || 'gpt-5.6-terra',
  }
}
