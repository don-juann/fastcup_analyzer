import { useLang } from '../i18n.jsx'
import { summarizeSession } from '../lib/sessions.js'
import { MONTHS_OPTIONS } from '../lib/useMatchScope.js'

// Overall (last N months) vs. one specific session, with a small per-session
// summary chip (date, map count, win/loss record). Shared by Duels + Hall of Fame.
export default function ScopePicker({ sessions, scope, setScope }) {
  const { t, lang } = useLang()
  const isSession = scope.type === 'session'

  return (
    <div className="scope-picker">
      <div className="mode-toggle">
        <button
          className={!isSession ? 'active' : ''}
          onClick={() => setScope({ type: 'overall', months: 6 })}
        >
          {t('scope.overall')}
        </button>
        <button
          className={isSession ? 'active' : ''}
          onClick={() => setScope({ type: 'session', id: sessions[0]?.id })}
          disabled={!sessions.length}
        >
          {t('scope.session')}
        </button>
      </div>

      {!isSession && (
        <div className="mode-toggle scope-months">
          {MONTHS_OPTIONS.map((n) => (
            <button
              key={n}
              className={scope.months === n ? 'active' : ''}
              onClick={() => setScope({ type: 'overall', months: n })}
            >
              {t('scope.months', { n })}
            </button>
          ))}
        </div>
      )}

      {isSession && (
        sessions.length ? (
          <div className="filters scope-sessions">
            {sessions.map((s) => {
              const sum = summarizeSession(s)
              const label = new Date(s.startedAt).toLocaleDateString(lang === 'kk' ? 'kk' : 'en', {
                day: 'numeric', month: 'short',
              })
              const resultClass = sum.wins > sum.losses ? 'win' : sum.wins < sum.losses ? 'loss' : ''
              return (
                <button
                  key={s.id}
                  className={`map ${resultClass} ${scope.id === s.id ? 'active' : ''}`}
                  onClick={() => setScope({ type: 'session', id: s.id })}
                >
                  {label} <b>{t('scope.maps', { n: sum.mapCount })} · {sum.wins}-{sum.losses}</b>
                </button>
              )
            })}
          </div>
        ) : <p className="note">{t('scope.noSessions')}</p>
      )}
    </div>
  )
}
