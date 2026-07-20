// Client helpers for our own backend (auth + tierlist).
async function req(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`)
  return json
}

export const api = {
  me: () => req('/api/auth/me'),
  login: (body) => req('/api/auth/login', { method: 'POST', body }),
  logout: () => req('/api/auth/logout', { method: 'POST' }),
  getTierlist: () => req('/api/tierlist'),
  saveTierlist: (data) => req('/api/tierlist', { method: 'PUT', body: { data } }),
}
