import { ensureSchema, getUserByFastcupId, createUser, publicUser } from '../../lib/db.js'
import { hashPassword, signSession, setSessionCookie } from '../../lib/auth.js'
import { parseFastcupId, readJsonBody } from '../../lib/util.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  try {
    await ensureSchema()
    const body = await readJsonBody(req)
    const fastcupId = parseFastcupId(body.fastcupLink ?? body.fastcupId)
    const nickname = String(body.nickname || '').trim()
    const password = String(body.password || '')

    if (!fastcupId) return res.status(400).json({ error: 'Enter a valid fastcup link or id' })
    if (nickname.length < 2) return res.status(400).json({ error: 'Nickname must be at least 2 characters' })
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })
    if (await getUserByFastcupId(fastcupId)) {
      return res.status(409).json({ error: 'An account for this fastcup profile already exists' })
    }

    const user = await createUser({ fastcupId, nickname, passwordHash: await hashPassword(password) })
    setSessionCookie(res, await signSession(user.id))
    return res.status(201).json({ user: publicUser(user) })
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) })
  }
}
