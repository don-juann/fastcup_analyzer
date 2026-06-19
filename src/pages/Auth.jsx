import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../auth.jsx'
import { useLang } from '../i18n.jsx'

export default function Auth() {
  const { user, ready, login, register } = useAuth()
  const { t } = useLang()
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
        <button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError('') }}>{t('auth.login')}</button>
        <button className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError('') }}>{t('auth.register')}</button>
      </div>

      <form className="auth-form" onSubmit={onSubmit}>
        <label>
          <span>{t('auth.linkLabel')}</span>
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
            <span>{t('auth.nickname')}</span>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={t('auth.nicknamePh')}
              maxLength={32}
            />
          </label>
        )}

        <label>
          <span>{t('auth.password')}</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'register' ? t('auth.passwordPhRegister') : t('auth.passwordPhLogin')}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          />
        </label>

        {error && <p className="error">{error}</p>}

        <button type="submit" className="auth-submit" disabled={busy}>
          {busy ? '…' : mode === 'register' ? t('auth.createAccount') : t('auth.login')}
        </button>
      </form>

      <p className="auth-hint">
        {mode === 'login' ? t('auth.hintLogin') : t('auth.hintRegister')}
      </p>
    </div>
  )
}
