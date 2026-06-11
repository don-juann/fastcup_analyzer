// Vercel serverless function — same proxy as server/index.js, but for prod.
// Routes /api/gql/:upstream (e.g. /api/gql/hasura) and forwards the GraphQL
// body to fastcup so the browser never hits CORS directly.
const UPSTREAMS = {
  hasura: 'https://hasura.fastcup.net/v1/graphql',
  api: 'https://api.fastcup.net/',
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }
  const target = UPSTREAMS[req.query.upstream]
  if (!target) {
    res.status(400).json({ error: 'unknown upstream' })
    return
  }
  try {
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    const r = await fetch(target, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'apollo-require-preflight': 'true',
        'user-agent': 'Mozilla/5.0 fastcup-analyzer',
        origin: 'https://cs2.fastcup.net',
        referer: 'https://cs2.fastcup.net/',
      },
      body,
    })
    const text = await r.text()
    res.status(r.status).setHeader('content-type', 'application/json')
    res.send(text)
  } catch (err) {
    res.status(502).json({ error: String(err) })
  }
}
