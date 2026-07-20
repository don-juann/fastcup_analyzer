import { ensureSchema, upsertUser, publicUser } from '../../lib/db.js'
import { signSession, setSessionCookie } from '../../lib/auth.js'
import { parseFastcupId, readJsonBody } from '../../lib/util.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  try {
    await ensureSchema()
    const body = await readJsonBody(req)
    const fastcupId = parseFastcupId(body.fastcupLink ?? body.fastcupId)
    if (!fastcupId) return res.status(400).json({ error: 'Enter a valid fastcup link or id' })

    const user = await upsertUser({ fastcupId, nickname: body.nickname })
    setSessionCookie(res, await signSession(user.id))
    return res.status(200).json({ user: publicUser(user) })
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) })
  }
}
