import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors,
  useDraggable, useDroppable,
} from '@dnd-kit/core'
import { useAuth } from '../auth.jsx'
import { api } from '../lib/api.js'
import { fetchPlayedWith } from '../lib/fastcup.js'

const TIERS = ['S', 'A', 'B', 'C', 'D', 'F']
const POOL = 'pool'

const MANUAL_DEFAULTS = [
  'AD1X', 'AL1ZH', 'a1byn', 'Sanjiro', 'hangover', 'guwappo',
  'juann', 'w0nder1y', 'arkhatiko', 'VANDAM', 'burger01', 'gunchik',
].map((nick, i) => ({ id: `m${i}`, nick }))

const emptyBook = () => ({
  manual: { players: MANUAL_DEFAULTS.map((p) => ({ ...p })), placements: {} },
  imported: { players: [], placements: {} },
})

const newId = () => `m-${Math.random().toString(36).slice(2, 9)}`

export default function Tierlist() {
  const { user, ready } = useAuth()
  const [book, setBook] = useState(emptyBook)
  const [mode, setMode] = useState('manual')
  const [activeId, setActiveId] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('saved')
  const [newName, setNewName] = useState('')
  const loadedRef = useRef(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
  )

  const selfId = user ? String(user.fastcupId) : null
  const current = book[mode]

  // Initial load.
  useEffect(() => {
    if (!ready || !user) return
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await api.getTierlist()
        if (cancelled) return
        const loaded = emptyBook()
        if (data?.manual || data?.imported) {
          if (data.manual?.players?.length) loaded.manual = data.manual
          if (data.imported) loaded.imported = data.imported
          setMode(data.mode === 'imported' ? 'imported' : 'manual')
        } else if (data?.players?.length) {
          // migrate old (fastcup-derived) shape -> imported
          loaded.imported = { players: data.players, placements: data.placements || {} }
          setMode('imported')
        }
        setBook(loaded)
        setStatus('ready')
        loadedRef.current = true
      } catch (e) {
        if (!cancelled) { setError(e.message || String(e)); setStatus('error') }
      }
    })()
    return () => { cancelled = true }
  }, [ready, user])

  // Debounced autosave.
  useEffect(() => {
    if (!loadedRef.current) return
    setSaved('saving')
    const t = setTimeout(() => {
      api.saveTierlist({ mode, manual: book.manual, imported: book.imported })
        .then(() => setSaved('saved'))
        .catch(() => setSaved('error'))
    }, 600)
    return () => clearTimeout(t)
  }, [book, mode])

  // Lazily import fastcup players when imported mode is first used.
  useEffect(() => {
    if (mode === 'imported' && loadedRef.current && !book.imported.players.length && !importing) {
      importPlayers()
    }
  }, [mode]) // eslint-disable-line

  async function importPlayers() {
    if (!user) return
    setImporting(true); setError('')
    try {
      const pool = await fetchPlayedWith(user.fastcupId)
      const self = { id: selfId, nick: user.nickname }
      setBook((b) => {
        const have = new Set(b.imported.players.map((p) => p.id))
        const incoming = [self, ...pool.map((p) => ({ id: String(p.id), nick: p.nick }))]
          .filter((p) => !have.has(p.id))
        // ensure self is present even if already there with a stale nick
        const players = b.imported.players.some((p) => p.id === selfId)
          ? [...b.imported.players, ...incoming.filter((p) => p.id !== selfId)]
          : [...b.imported.players, ...incoming]
        return { ...b, imported: { ...b.imported, players } }
      })
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setImporting(false)
    }
  }

  const byTier = useMemo(() => {
    const m = { [POOL]: [], S: [], A: [], B: [], C: [], D: [], F: [] }
    for (const p of current.players) (m[current.placements[p.id] || POOL] ?? m[POOL]).push(p)
    return m
  }, [current])

  const nickOf = (id) => current.players.find((p) => p.id === id)?.nick

  function setCurrent(updater) {
    setBook((b) => ({ ...b, [mode]: updater(b[mode]) }))
  }

  function onDragEnd({ active, over }) {
    setActiveId(null)
    if (!over) return
    const tier = over.id === POOL ? POOL : over.id
    setCurrent((c) => ({ ...c, placements: { ...c.placements, [active.id]: tier } }))
  }

  function addPlayer(e) {
    e.preventDefault()
    const nick = newName.trim()
    if (!nick) return
    setCurrent((c) => ({ ...c, players: [...c.players, { id: newId(), nick }] }))
    setNewName('')
  }

  function removePlayer(id) {
    setCurrent((c) => {
      const placements = { ...c.placements }
      delete placements[id]
      return { players: c.players.filter((p) => p.id !== id), placements }
    })
  }

  if (ready && !user) return <Navigate to="/login" replace />

  const manual = mode === 'manual'

  return (
    <div className="tl">
      <div className="tl-head">
        <h1>tierlist<span className="dot">.</span></h1>
        <span className={`save-state ${saved}`}>
          {saved === 'saving' ? 'saving…' : saved === 'error' ? 'save failed' : 'saved'}
        </span>
      </div>

      <div className="mode-toggle">
        <button className={manual ? 'active' : ''} onClick={() => setMode('manual')}>manual</button>
        <button className={!manual ? 'active' : ''} onClick={() => setMode('imported')}>imported</button>
      </div>

      <p className="sub">
        {manual
          ? 'add or remove names, then drag them from S (best) to F. saved automatically.'
          : 'players pulled from your recent fastcup matches (you included). drag to rank.'}
      </p>

      {manual ? (
        <form className="add-row" onSubmit={addPlayer}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="add a name…" maxLength={32} />
          <button type="submit">add</button>
        </form>
      ) : (
        <button className="load-btn" onClick={importPlayers} disabled={importing}>
          {importing ? 'importing…' : 'refresh from fastcup'}
        </button>
      )}

      {status === 'error' && <p className="error">{error}</p>}
      {!manual && importing && !current.players.length && (
        <p className="note">loading the people you’ve played with…</p>
      )}

      <DndContext
        sensors={sensors}
        onDragStart={({ active }) => setActiveId(active.id)}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="tiers">
          {TIERS.map((t) => (
            <div className={`tier tier-${t}`} key={t}>
              <div className="tier-label">{t}</div>
              <Dropzone id={t} className="tier-drop">
                {byTier[t].map((p) => (
                  <Chip key={p.id} id={p.id} nick={p.nick} self={p.id === selfId}
                    onRemove={manual ? () => removePlayer(p.id) : null} />
                ))}
              </Dropzone>
            </div>
          ))}
        </div>

        <div className="pool-head">unranked</div>
        <Dropzone id={POOL} className="pool">
          {byTier[POOL].length
            ? byTier[POOL].map((p) => (
              <Chip key={p.id} id={p.id} nick={p.nick} self={p.id === selfId}
                onRemove={manual ? () => removePlayer(p.id) : null} />
            ))
            : <span className="pool-empty">everyone’s ranked 🎉</span>}
        </Dropzone>

        <DragOverlay>{activeId ? <Chip id={activeId} nick={nickOf(activeId)} overlay /> : null}</DragOverlay>
      </DndContext>
    </div>
  )
}

function Chip({ id, nick, overlay, self, onRemove }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id })
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`chip${isDragging ? ' dragging' : ''}${overlay ? ' overlay' : ''}${self ? ' chip-self' : ''}`}
      title={nick}
    >
      <span className="chip-name">{nick}</span>
      {onRemove && (
        <button
          className="chip-x"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          aria-label={`remove ${nick}`}
        >
          ×
        </button>
      )}
    </div>
  )
}

function Dropzone({ id, className, children }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return <div ref={setNodeRef} className={`${className}${isOver ? ' over' : ''}`}>{children}</div>
}
