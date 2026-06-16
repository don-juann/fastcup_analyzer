import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../auth.jsx'

export default function Auth() {
  const { user, ready, login, register } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [link, setLink] = useState('')
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (ready && user) return <Navigate to="/tierlist" replace />

  async function onSubmit(e) {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      const body = { fastcupLink: link, password }
      if (mode === 'register') { body.nickname = nickname; await register(body) }
      else await login(body)
      navigate('/tierlist')
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-card">
      <div className="auth-tabs">
        <button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError('') }}>log in</button>
        <button className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError('') }}>register</button>
      </div>

      <form className="auth-form" onSubmit={onSubmit}>
        <label>
          <span>fastcup profile link</span>
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://cs2.fastcup.net/idXXXXXX"
            spellCheck={false}
            autoComplete="username"
          />
        </label>

        {mode === 'register' && (
          <label>
            <span>nickname</span>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="how you'll be shown"
              maxLength={32}
            />
          </label>
        )}

        <label>
          <span>password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'register' ? 'at least 6 characters' : '••••••••'}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          />
        </label>

        {error && <p className="error">{error}</p>}

        <button type="submit" className="auth-submit" disabled={busy}>
          {busy ? '…' : mode === 'register' ? 'create account' : 'log in'}
        </button>
      </form>

      <p className="auth-hint">
        {mode === 'login'
          ? 'Your fastcup link identifies you and lets us pull the players you’ve played with.'
          : 'Register with your fastcup link so your tierlist is filled with people you actually queue with.'}
      </p>
    </div>
  )
}
