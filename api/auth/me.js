import { ensureSchema, getUserById, publicUser } from '../../lib/db.js'
import { getSession } from '../../lib/auth.js'

export default async function handler(req, res) {
  try {
    const session = await getSession(req)
    if (!session) return res.status(200).json({ user: null })
    await ensureSchema()
    const user = await getUserById(session.userId)
    return res.status(200).json({ user: publicUser(user) })
  } catch {
    return res.status(200).json({ user: null })
  }
}
