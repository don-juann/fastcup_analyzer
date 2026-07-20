import { createContext, useContext, useEffect, useState } from 'react'
import { api } from './lib/api.js'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    api.me().then((r) => setUser(r.user)).catch(() => {}).finally(() => setReady(true))
  }, [])

  const value = {
    user,
    ready,
    async login(body) { const r = await api.login(body); setUser(r.user); return r.user },
    async logout() { await api.logout().catch(() => {}); setUser(null) },
  }
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export function useAuth() {
  return useContext(AuthCtx)
}
