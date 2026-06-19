import { useLang } from '../i18n.jsx'

export default function HallOfFame() {
  const { t } = useLang()
  return (
    <div className="hof">
      <div className="tl-head">
        <h1>{t('hof.title')}<span className="dot">.</span></h1>
      </div>
      <div className="hof-empty">{t('hof.empty')}</div>
    </div>
  )
}
