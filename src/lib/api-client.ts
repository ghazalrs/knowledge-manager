export async function request(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error(`Local server request failed (${response.status})`)
  return response
}
