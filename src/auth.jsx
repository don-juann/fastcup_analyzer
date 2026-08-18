import { createContext, useContext, useState } from 'react'

// No accounts, no passwords, no server-side session — "identity" is just
// the fastcup profile id/nickname the person typed in, kept in localStorage
// so it survives a reload but never leaves the browser.
const IDENTITY_KEY = 'fc-identity'

function loadIdentity() {
  try { return JSON.parse(localStorage.getItem(IDENTITY_KEY) || 'null') } catch { return null }
}

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(loadIdentity)

  const value = {
    user,
    ready: true,
    identify({ fastcupId, nickname }) {
      const next = { fastcupId, nickname: (nickname || '').trim() || `Player ${fastcupId}` }
      try { localStorage.setItem(IDENTITY_KEY, JSON.stringify(next)) } catch { /* quota */ }
      setUser(next)
      return next
    },
    forget() {
      try { localStorage.removeItem(IDENTITY_KEY) } catch { /* quota */ }
      setUser(null)
    },
  }
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export function useAuth() {
  return useContext(AuthCtx)
}
