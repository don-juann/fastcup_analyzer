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

export default function Tierlist() {
  const { user, ready } = useAuth()
  const [players, setPlayers] = useState([])      // [{ id(string), nick }]
  const [placements, setPlacements] = useState({}) // { id: tier }
  const [activeId, setActiveId] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('saved')     // saved | saving
  const loadedRef = useRef(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
  )

  // Initial load: saved tierlist, or build the pool from fastcup.
  useEffect(() => {
    if (!ready || !user) return
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await api.getTierlist()
        if (cancelled) return
        if (data?.players?.length) {
          setPlayers(data.players)
          setPlacements(data.placements || {})
          setStatus('ready')
        } else {
          setStatus('loading')
          const pool = await fetchPlayedWith(user.fastcupId)
          if (cancelled) return
          const norm = pool.map((p) => ({ id: String(p.id), nick: p.nick }))
          setPlayers(norm)
          setPlacements({})
          setStatus('ready')
        }
        loadedRef.current = true
      } catch (e) {
        if (!cancelled) { setError(e.message || String(e)); setStatus('error') }
      }
    })()
    return () => { cancelled = true }
  }, [ready, user])

  // Debounced autosave after the first load.
  useEffect(() => {
    if (!loadedRef.current) return
    setSaved('saving')
    const t = setTimeout(() => {
      api.saveTierlist({ players, placements })
        .then(() => setSaved('saved'))
        .catch(() => setSaved('error'))
    }, 600)
    return () => clearTimeout(t)
  }, [players, placements])

  const byTier = useMemo(() => {
    const m = { [POOL]: [], S: [], A: [], B: [], C: [], D: [], F: [] }
    for (const p of players) (m[placements[p.id] || POOL] ?? m[POOL]).push(p)
    return m
  }, [players, placements])

  const nickOf = (id) => players.find((p) => p.id === id)?.nick

  function onDragEnd({ active, over }) {
    setActiveId(null)
    if (!over) return
    const tier = over.id === POOL ? POOL : over.id
    setPlacements((prev) => ({ ...prev, [active.id]: tier }))
  }

  async function refreshPlayers() {
    if (!user) return
    setStatus('loading')
    try {
      const pool = await fetchPlayedWith(user.fastcupId)
      setPlayers((prev) => {
        const have = new Set(prev.map((p) => p.id))
        const added = pool
          .map((p) => ({ id: String(p.id), nick: p.nick }))
          .filter((p) => !have.has(p.id))
        return [...prev, ...added]
      })
      setStatus('ready')
    } catch (e) {
      setError(e.message || String(e)); setStatus('error')
    }
  }

  if (ready && !user) return <Navigate to="/login" replace />

  return (
    <div className="tl">
      <div className="tl-head">
        <h1>tierlist<span className="dot">.</span></h1>
        <div className="tl-actions">
          <span className={`save-state ${saved}`}>
            {saved === 'saving' ? 'saving…' : saved === 'error' ? 'save failed' : 'saved'}
          </span>
          <button className="load-btn" onClick={refreshPlayers} disabled={status === 'loading'}>
            refresh players
          </button>
        </div>
      </div>
      <p className="sub">drag players into a row, from S (best) to F. saved automatically.</p>

      {status === 'error' && <p className="error">{error}</p>}
      {status === 'loading' && !players.length && <p className="note">loading the people you’ve played with…</p>}

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
                {byTier[t].map((p) => <Chip key={p.id} id={p.id} nick={p.nick} />)}
              </Dropzone>
            </div>
          ))}
        </div>

        <div className="pool-head">unranked {status === 'loading' && players.length ? '· updating…' : ''}</div>
        <Dropzone id={POOL} className="pool">
          {byTier[POOL].length
            ? byTier[POOL].map((p) => <Chip key={p.id} id={p.id} nick={p.nick} />)
            : <span className="pool-empty">everyone’s ranked 🎉</span>}
        </Dropzone>

        <DragOverlay>{activeId ? <Chip id={activeId} nick={nickOf(activeId)} overlay /> : null}</DragOverlay>
      </DndContext>
    </div>
  )
}

function Chip({ id, nick, overlay }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id })
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`chip${isDragging ? ' dragging' : ''}${overlay ? ' overlay' : ''}`}
      title={nick}
    >
      {nick}
    </div>
  )
}

function Dropzone({ id, className, children }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return <div ref={setNodeRef} className={`${className}${isOver ? ' over' : ''}`}>{children}</div>
}
