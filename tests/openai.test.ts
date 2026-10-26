import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generateReply } from '../server/openai.ts'

const messages = [{ role: 'user' as const, content: 'Hello' }, { role: 'assistant' as const, content: 'Hi' }, { role: 'user' as const, content: 'Continue' }]

test('sends text context with server credentials and extracts text across output items', async () => {
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/responses')
    assert.ok(init)
    assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer test-secret')
    const body = JSON.parse(init.body as string)
    assert.equal(body.model, 'test-model')
    assert.equal(body.store, false)
    assert.deepEqual(body.input, messages)
    return Response.json({ status: 'completed', output: [
      { type: 'reasoning', summary: [] },
      { type: 'message', content: [{ type: 'output_text', text: 'First part' }, { type: 'output_text', text: 'Second part' }] },
    ] })
  }
  assert.deepEqual(await generateReply(messages, { apiKey: 'test-secret', model: 'test-model', fetcher }), {
    content: 'First part\nSecond part', model: 'test-model',
  })
})

test('missing credentials and upstream failures have actionable messages without leaking secrets', async () => {
  await assert.rejects(generateReply(messages, { model: 'test' }), /OPENAI_API_KEY/)
  for (const status of [400, 401, 403, 404, 429, 500]) {
    const fetcher: typeof fetch = async () => Response.json({ error: { message: 'test-secret' } }, { status })
    await assert.rejects(generateReply(messages, { apiKey: 'test-secret', model: 'test', fetcher }), (error: Error) => {
      assert.ok(error.message.length > 10)
      assert.ok(!error.message.includes('test-secret'))
      return true
    })
  }
  const fetcher: typeof fetch = async () => { throw new Error('network error with test-secret') }
  await assert.rejects(generateReply(messages, { apiKey: 'test-secret', model: 'test', fetcher }), /Could not reach OpenAI/)
})

test('handles refusals and rejects incomplete or empty replies', async () => {
  const options = { apiKey: 'test-secret', model: 'test' }
  const refusal: typeof fetch = async () => Response.json({ output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'I cannot help with that.' }] }] })
  assert.equal((await generateReply(messages, { ...options, fetcher: refusal })).content, 'I cannot help with that.')
  const incomplete: typeof fetch = async () => Response.json({ status: 'incomplete', output: [] })
  await assert.rejects(generateReply(messages, { ...options, fetcher: incomplete }), /before completing/)
  const empty: typeof fetch = async () => Response.json({ status: 'completed', output: [] })
  await assert.rejects(generateReply(messages, { ...options, fetcher: empty }), /empty reply/)
})
