import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { loadChatConfig } from '../server/chat-config.ts'

test('local OpenAI configuration takes precedence over inherited variables', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'knowledge-manager-config-'))
  const path = join(directory, '.env.local')
  const inherited = { OPENAI_API_KEY: 'inherited-test', OPENAI_MODEL: 'inherited-model' }
  try {
    assert.deepEqual(await loadChatConfig(path, inherited), { apiKey: 'inherited-test', model: 'inherited-model' })
    await writeFile(path, 'OPENAI_API_KEY=local-test\nOPENAI_MODEL=local-model\n')
    assert.deepEqual(await loadChatConfig(path, inherited), { apiKey: 'local-test', model: 'local-model' })
    await writeFile(path, 'OPENAI_API_KEY=\n')
    assert.equal((await loadChatConfig(path, inherited)).apiKey, '')
    assert.deepEqual(await loadChatConfig(join(directory, 'missing'), {}), { apiKey: undefined, model: 'gpt-5.6-terra' })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
