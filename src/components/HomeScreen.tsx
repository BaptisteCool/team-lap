import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '../convex/hooks'
import { fmtClock, fmtKmPace, kmPaceToLapMs, LAP_DISTANCE_M, TEAM_COLOR_PALETTE } from '../lib/race-data'
import { GpxMap } from './GpxMap'

interface Runner {
  id: string
  name: string
  kmMin: number
  kmSec: number
  color?: string
  status?: string
  energy?: number
  plannedLaps?: number
  liveKmMin?: number | null
  liveKmSec?: number | null
}

interface TeamFull {
  _id: string
  name: string
  color: string
  category: string
  maxRunners: number
  goalLaps: number
  ready: boolean
  autoPaused?: boolean
  profileImage?: string
  currentIdx?: number
  runners: Runner[]
  order: string[]
}

interface HomeScreenProps {
  onPickTeam: (teamId: string) => void
}

export function HomeScreen({ onPickTeam }: HomeScreenProps) {
  const navigate = useNavigate()
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])

  // Aggressive autoTick on Home so checkpoint crossings fire near real-time.
  // Server-side debounced (5s) — overhead negligible.
  const autoTickMutation = useMutation('laps:autoTick' as any)
  useEffect(() => {
    autoTickMutation({}).catch(() => {})
    const id = setInterval(() => {
      autoTickMutation({}).catch(() => {})
    }, 2000)
    return () => clearInterval(id)
  }, [autoTickMutation])

  // Get the event by slug
  const event = useQuery('events:getBySlug' as any, { slug: '24h-brette-les-pins-2026' }) as any

  // Get all teams (+ runners + order) for the event
  const teams = useQuery(
    'teams:getTeamsFull' as any,
    event?._id ? { eventId: event._id } : 'skip',
  ) as TeamFull[] | null | undefined

  // All laps for the event (used to compute live progress on map)
  const allLaps = useQuery(
    'laps:getLapsByEvent' as any,
    event?._id ? { eventId: event._id } : 'skip',
  ) as any[] | null | undefined

  const raceStarted = event?.status === 'running'
  const raceStartTime = event?.actualStart || null
  const elapsedMs = raceStarted && raceStartTime ? Math.max(0, now - raceStartTime) : 0

  // Index laps per team
  const lapsByTeam = new Map<string, any[]>()
  if (allLaps) {
    for (const l of allLaps) {
      if (!lapsByTeam.has(l.teamId)) lapsByTeam.set(l.teamId, [])
      lapsByTeam.get(l.teamId)!.push(l)
    }
  }


  // Resolve current runner from DB currentIdx (matches server state — advances on manual relay)
  function getDbCurrentRunner(t: TeamFull): Runner | null {
    if (!t.runners?.length) return null
    const orderArr: string[] = (t.order && t.order.length > 0)
      ? t.order
      : t.runners.map((r) => r.id)
    if (orderArr.length === 0) return null
    const id = orderArr[(t.currentIdx || 0) % orderArr.length]
    return t.runners.find((r) => r.id === id) || t.runners[0]
  }

  const markers = (teams || [])
    .filter(t => t.ready)
    .map(t => {
      const tLaps = (lapsByTeam.get(t._id) || []).filter((l) => l.type !== 'position').slice().sort((a, b) => a.timestamp - b.timestamp)
      const lastLapAt = tLaps.length ? tLaps[tLaps.length - 1].timestamp : raceStartTime
      const dbCurrent = getDbCurrentRunner(t)
      // Marker: prefer live pace if its lap is within admin-configured bounds.
      const minLapMsHome = (event?.minLapSec ?? 165) * 1000
      const maxLapMsHome = (event?.maxLapSec ?? 480) * 1000
      const expectedLapMs = (() => {
        if (!dbCurrent) return kmPaceToLapMs(6, 0)
        if (dbCurrent.liveKmMin != null && dbCurrent.liveKmSec != null) {
          const liveLapMs = kmPaceToLapMs(dbCurrent.liveKmMin, dbCurrent.liveKmSec)
          if (liveLapMs >= minLapMsHome && liveLapMs <= maxLapMsHome) return liveLapMs
        }
        return kmPaceToLapMs(dbCurrent.kmMin, dbCurrent.kmSec)
      })()
      let progress = 0
      if (raceStarted && lastLapAt && expectedLapMs > 0) {
        progress = ((now - lastLapAt) / expectedLapMs) % 1
        if (progress < 0) progress = 0
      }
      // Freeze marker just before line when team's cron is paused (runner stopped)
      if (t.autoPaused) progress = 0.92
      return {
        id: t._id,
        color: t.color || TEAM_COLOR_PALETTE[0],
        progress,
        label: t.name || '',
      }
    })

  return (
    <div className="page">
      <div className="grid" style={{ gap: 18, maxWidth: 980, margin: '0 auto' }}>
        {/* Carte circuit en haut */}
        <div className="card">
          <div className="card-head">
            <span>🗺️</span>
            <h3>Circuit · live</h3>
            <span className="badge" style={{ marginLeft: 'auto' }}>{LAP_DISTANCE_M} m / tour</span>
            <span className={`badge ${raceStarted ? 'accent' : ''}`}>
              {raceStarted ? `LIVE · ${fmtClock(elapsedMs)}` : 'Course non démarrée'}
            </span>
          </div>
          <div className="card-body">
            <GpxMap height={420} markers={markers} showLabel />
          </div>
        </div>

        {/* Liste équipes dessous */}
        <div className="card">
          <div className="card-head">
            <span>👥</span>
            <h3>Équipes inscrites · {teams?.length || 0}</h3>
            {/* Discreet admin button */}
            <button
              onClick={() => navigate({ to: '/admin' })}
              style={{
                marginLeft: 'auto',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                opacity: 0.3,
                fontSize: 16,
                padding: 4,
              }}
              title="Administration"
            >
              ⚙️
            </button>
          </div>
          <div className="card-body">
            {!teams || teams.length === 0 && <div className="empty">Aucune équipe enregistrée.</div>}
            {teams && teams.length > 0 && (
              <div className="grid" style={{ gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
                {teams.map(t => {
                  const current = getDbCurrentRunner(t)
                  const tLaps = (lapsByTeam.get(t._id) || []).filter((l) => l.type !== 'position')
                  const teamTotalLaps = tLaps.length
                  const runnerLaps = current ? tLaps.filter((l) => l.runnerId === current.id).length : 0
                  const pace = current
                    ? (() => {
                        if (current.liveKmMin != null && current.liveKmSec != null) {
                          const lapMs = kmPaceToLapMs(current.liveKmMin, current.liveKmSec)
                          const minMs = (event?.minLapSec ?? 165) * 1000
                          const maxMs = (event?.maxLapSec ?? 480) * 1000
                          if (lapMs >= minMs && lapMs <= maxMs) return fmtKmPace(current.liveKmMin, current.liveKmSec)
                        }
                        return fmtKmPace(current.kmMin, current.kmSec)
                      })()
                    : '—'
                  return (
                    <button
                      key={t._id}
                      onClick={() => onPickTeam(t._id)}
                      className="card"
                      style={{
                        background: 'var(--bg-2)',
                        borderRadius: 12,
                        padding: 14,
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'grid',
                        gap: 8,
                        border: '1px solid var(--border)',
                        borderLeft: `4px solid ${t.color || 'var(--accent)'}`,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {t.profileImage ? (
                          <img
                            src={t.profileImage}
                            alt={t.name}
                            style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'cover' }}
                          />
                        ) : (
                          <div
                            className="mono"
                            style={{
                              width: 36, height: 36, borderRadius: 10,
                              background: t.color || 'var(--accent)', color: '#0a0e0c',
                              display: 'grid', placeItems: 'center', fontWeight: 700,
                            }}
                          >
                            {t.name ? t.name.charAt(0).toUpperCase() : '?'}
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {t.name || '(sans nom)'}
                          </div>
                          <div className="hint">{t.category}</div>
                        </div>
                        {!raceStarted && t.ready && (
                          <span className="badge accent" style={{ fontSize: 10, padding: '2px 6px' }}>✓ prêt</span>
                        )}
                        <span>🔒</span>
                      </div>

                      {/* Current runner band */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr auto',
                          gap: 6,
                          padding: '8px 10px',
                          borderRadius: 8,
                          background: 'var(--bg)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                            {current?.color && (
                              <span style={{ width: 8, height: 8, borderRadius: 999, background: current.color, flexShrink: 0 }} />
                            )}
                            <span style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {current?.name || '—'}
                            </span>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div className="mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>{runnerLaps} • {pace}</div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--muted)', flexWrap: 'wrap' }} className="mono">
                        <span>·</span>
                        <span>🏁 {teamTotalLaps} t. équipe</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}