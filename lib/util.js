// Shared helpers (server + can be reused client-side).

// "https://cs2.fastcup.net/id685178" | "id685178" | "685178" -> 685178
export function parseFastcupId(input) {
  const m = String(input ?? '').trim().match(/(?:id)?(\d+)\D*$/)
  if (!m) return null
  return Number(m[1])
}

// Read + JSON-parse a request body across Vercel (pre-parsed) and raw Node.
export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body) } catch { return {} }
  }
  // Raw stream fallback
  const chunks = []
  for await (const c of req) chunks.push(c)
  if (!chunks.length) return {}
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return {} }
}
