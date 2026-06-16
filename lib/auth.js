// Password hashing + signed-cookie sessions (JWT via jose).
import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import { parse as parseCookie, serialize as serializeCookie } from 'cookie'

const COOKIE = 'fc_sid'
const MAX_AGE = 60 * 60 * 24 * 30 // 30 days
const secretStr = process.env.SESSION_SECRET || 'dev-insecure-secret-change-me'
const secret = new TextEncoder().encode(secretStr)
const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL

export function hashPassword(pw) {
  return bcrypt.hash(pw, 10)
}
export function verifyPassword(pw, hash) {
  return bcrypt.compare(pw, hash)
}

export async function signSession(userId) {
  return new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret)
}

export async function getSession(req) {
  try {
    const cookies = parseCookie(req.headers?.cookie || '')
    const token = cookies[COOKIE]
    if (!token) return null
    const { payload } = await jwtVerify(token, secret)
    return { userId: payload.uid }
  } catch {
    return null
  }
}

export function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', serializeCookie(COOKIE, token, {
    httpOnly: true, secure: isProd, sameSite: 'lax', path: '/', maxAge: MAX_AGE,
  }))
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', serializeCookie(COOKIE, '', {
    httpOnly: true, secure: isProd, sameSite: 'lax', path: '/', maxAge: 0,
  }))
}
