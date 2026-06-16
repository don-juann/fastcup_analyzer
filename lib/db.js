// Neon Postgres access + lazy schema setup. Used by the serverless API
// functions and the local dev proxy. Needs env DATABASE_URL (or POSTGRES_URL).
import { neon } from '@neondatabase/serverless'

// Find a Postgres connection string. Prefer the standard names, but also
// tolerate Vercel/Neon "custom prefix" vars (e.g. STORAGE_DATABASE_URL) and
// the pooled POSTGRES_* variants.
function findDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  if (process.env.POSTGRES_URL) return process.env.POSTGRES_URL
  const key = Object.keys(process.env).find(
    (k) => /(_|^)(DATABASE_URL|POSTGRES_URL)$/.test(k) && process.env[k],
  )
  return key ? process.env[key] : null
}

const url = findDatabaseUrl()
if (!url) {
  console.warn('[db] No Postgres URL found (DATABASE_URL / POSTGRES_URL) — auth/tierlist will fail until it is set.')
}
export const sql = url ? neon(url) : null

let schemaReady = null
export function ensureSchema() {
  if (!sql) throw new Error('Database not configured (set DATABASE_URL)')
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          fastcup_id INTEGER UNIQUE NOT NULL,
          nickname TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`
      await sql`
        CREATE TABLE IF NOT EXISTS tierlists (
          user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          data JSONB NOT NULL DEFAULT '{}'::jsonb,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`
    })().catch((e) => { schemaReady = null; throw e })
  }
  return schemaReady
}

export async function getUserByFastcupId(fastcupId) {
  const rows = await sql`SELECT * FROM users WHERE fastcup_id = ${fastcupId} LIMIT 1`
  return rows[0] || null
}

export async function getUserById(id) {
  const rows = await sql`SELECT * FROM users WHERE id = ${id} LIMIT 1`
  return rows[0] || null
}

export async function createUser({ fastcupId, nickname, passwordHash }) {
  const rows = await sql`
    INSERT INTO users (fastcup_id, nickname, password_hash)
    VALUES (${fastcupId}, ${nickname}, ${passwordHash})
    RETURNING *`
  return rows[0]
}

export async function getTierlist(userId) {
  const rows = await sql`SELECT data FROM tierlists WHERE user_id = ${userId} LIMIT 1`
  return rows[0]?.data ?? null
}

export async function saveTierlist(userId, data) {
  const json = JSON.stringify(data ?? {})
  await sql`
    INSERT INTO tierlists (user_id, data, updated_at)
    VALUES (${userId}, ${json}::jsonb, now())
    ON CONFLICT (user_id)
    DO UPDATE SET data = ${json}::jsonb, updated_at = now()`
}

export function publicUser(u) {
  return u && { id: u.id, nickname: u.nickname, fastcupId: u.fastcup_id }
}
