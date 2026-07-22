import { createContext, useContext, useEffect, useState } from 'react'
import { api } from './lib/api.js'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState({ id: 1, nickname: 'TEST_STUB', fastcupId: 685178 })
  const [ready, setReady] = useState(true)

  useEffect(() => {
    // TEMP TEST STUB — DO NOT COMMIT
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
