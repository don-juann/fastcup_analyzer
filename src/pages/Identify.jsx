import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../auth.jsx'
import { useLang } from '../i18n.jsx'
import { parseProfileId, fetchRecentMatchList, fetchMatchRoster } from '../lib/fastcup.js'

// Best-effort: pull the nickname off the roster of the player's most recent
// match. Login still works with no nickname if this can't find one.
async function resolveNickname(fastcupId) {
  try {
    const list = await fetchRecentMatchList(fastcupId, 1)
    if (!list.length) return ''
    const roster = await fetchMatchRoster(list[0].id)
    return roster.find((p) => p.id === fastcupId)?.nick || ''
  } catch {
    return ''
  }
}

export default function Identify() {
  const { user, ready, login } = useAuth()
  const { t } = useLang()
  const navigate = useNavigate()
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (ready && user) return <Navigate to="/analyzer" replace />

  async function onSubmit(e) {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      const fastcupId = parseProfileId(link)
      const nickname = await resolveNickname(fastcupId)
      await login({ fastcupId, nickname })
      navigate('/analyzer')
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-card">
      <form className="auth-form" onSubmit={onSubmit}>
        <label>
          <span>{t('auth.linkLabel')}</span>
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://cs2.fastcup.net/idXXXXXX"
            spellCheck={false}
            autoFocus
          />
        </label>

        {error && <p className="error">{error}</p>}

        <button type="submit" className="auth-submit" disabled={busy}>
          {busy ? '…' : t('auth.login')}
        </button>
      </form>

      <p className="auth-hint">{t('auth.hintLogin')}</p>
    </div>
  )
}
