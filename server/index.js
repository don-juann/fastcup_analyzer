// Tiny proxy so the browser can talk to fastcup's GraphQL without CORS issues.
// In dev it ALSO mounts the same auth/tierlist handlers Vercel runs in prod,
// so `npm run dev` behaves like the deployed app.
import 'dotenv/config'
import express from 'express'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import register from '../api/auth/register.js'
import login from '../api/auth/login.js'
import logout from '../api/auth/logout.js'
import me from '../api/auth/me.js'
import tierlist from '../api/tierlist.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
app.use(express.json({ limit: '2mb' }))

const PORT = process.env.PORT || 8787

// Mount the serverless handlers (they use req/res in a Vercel-compatible way).
app.post('/api/auth/register', register)
app.post('/api/auth/login', login)
app.post('/api/auth/logout', logout)
app.get('/api/auth/me', me)
app.all('/api/tierlist', tierlist)

// Allowed upstream GraphQL endpoints (keyed so the client can't proxy anywhere).
const UPSTREAMS = {
  hasura: 'https://hasura.fastcup.net/v1/graphql',
  api: 'https://api.fastcup.net/',
}

// POST /api/gql/:upstream  -> forwards the GraphQL body to fastcup
app.post('/api/gql/:upstream', async (req, res) => {
  const target = UPSTREAMS[req.params.upstream]
  if (!target) return res.status(400).json({ error: 'unknown upstream' })
  try {
    const r = await fetch(target, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'apollo-require-preflight': 'true',
        'user-agent': 'Mozilla/5.0 fastcup-analyzer',
        // fastcup checks origin/referer loosely; mimic the site.
        origin: 'https://cs2.fastcup.net',
        referer: 'https://cs2.fastcup.net/',
      },
      body: JSON.stringify(req.body),
    })
    const text = await r.text()
    res.status(r.status).type('application/json').send(text)
  } catch (err) {
    res.status(502).json({ error: String(err) })
  }
})

// In production, serve the built frontend.
const dist = path.join(__dirname, '..', 'dist')
app.use(express.static(dist))
app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')))

app.listen(PORT, () => {
  console.log(`[fastcup-analyzer] proxy listening on http://localhost:${PORT}`)
})
