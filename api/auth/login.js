import { ensureSchema, getUserByFastcupId, publicUser } from '../../lib/db.js'
import { verifyPassword, signSession, setSessionCookie } from '../../lib/auth.js'
import { parseFastcupId, readJsonBody } from '../../lib/util.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  try {
    await ensureSchema()
    const body = await readJsonBody(req)
    const fastcupId = parseFastcupId(body.fastcupLink ?? body.fastcupId)
    const password = String(body.password || '')
    if (!fastcupId) return res.status(400).json({ error: 'Enter a valid fastcup link or id' })

    const user = await getUserByFastcupId(fastcupId)
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ error: 'Wrong fastcup link or password' })
    }
    setSessionCookie(res, await signSession(user.id))
    return res.status(200).json({ user: publicUser(user) })
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) })
  }
}
