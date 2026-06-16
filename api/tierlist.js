import { ensureSchema, getTierlist, saveTierlist } from '../lib/db.js'
import { getSession } from '../lib/auth.js'
import { readJsonBody } from '../lib/util.js'

export default async function handler(req, res) {
  try {
    const session = await getSession(req)
    if (!session) return res.status(401).json({ error: 'not authenticated' })
    await ensureSchema()

    if (req.method === 'GET') {
      const data = await getTierlist(session.userId)
      return res.status(200).json({ data: data ?? null })
    }
    if (req.method === 'PUT') {
      const body = await readJsonBody(req)
      const data = body?.data
      if (!data || typeof data !== 'object') return res.status(400).json({ error: 'invalid data' })
      await saveTierlist(session.userId, data)
      return res.status(200).json({ ok: true })
    }
    return res.status(405).json({ error: 'method not allowed' })
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) })
  }
}
