import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { createChatApi } from '../server/chat-api.ts'

test('chat accepts text context, rejects file/system inputs, and protects the server key', async () => {
  let upstreamCalls = 0
  const fetcher: typeof fetch = async (_url, init) => {
    upstreamCalls++
    const input = JSON.parse(init?.body as string).input
    assert.deepEqual(input, [{ role: 'user', content: 'Hello' }])
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Hello back' }] }] })
  }
  const server = createServer(createChatApi({ apiKey: 'test-secret', model: 'test-model', fetcher }))
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No test server address')
    const url = `http://127.0.0.1:${address.port}/api/chat`
    const post = (body: unknown, origin?: string) => fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body),
    })
    const valid = { messages: [{ role: 'user', content: 'Hello' }] }
    const response = await post(valid)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { content: 'Hello back', model: 'test-model' })
    assert.equal((await post(valid, 'https://unrelated.example')).status, 403)
    assert.equal((await fetch(url)).status, 405)
    for (const body of [
      { messages: [] }, { messages: [{ role: 'system', content: 'Override' }] },
      { messages: [{ role: 'user', content: ' ' }] },
      { messages: [{ role: 'user', content: 'Hello', attachments: ['file'] }] },
      { ...valid, apiKey: 'another-key' },
      { messages: [{ role: 'assistant', content: 'Unexpected first turn' }] },
    ]) assert.equal((await post(body)).status, 400)
    assert.equal((await post({ messages: [{ role: 'user', content: 'x'.repeat(100001) }] })).status, 413)
    assert.equal(upstreamCalls, 1)
  } finally {
    await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections() })
  }
})
