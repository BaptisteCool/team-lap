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

  // Build planned schedule for a team: ordered list of laps where each entry = {runnerId, durationMs}
  // Uses ESTIMATED pace only (kmMin/kmSec) — ignores live & override → marker stays stable.
  function buildSchedule(t: TeamFull): Array<{ runnerId: string; runnerName: string; runnerColor?: string; durationMs: number }> {
    const orderArr: string[] =
      Array.isArray(t.order) && t.order.length > 0
        ? t.order
        : (t.runners || []).map((r) => r.id)
    if (orderArr.length === 0 || !t.runners?.length) return []
    const sched: Array<{ runnerId: string; runnerName: string; runnerColor?: string; durationMs: number }> = []
    for (const id of orderArr) {
      const r = t.runners.find((x) => x.id === id)
      if (!r || r.status === 'out') continue
      const planned = Math.max(1, r.plannedLaps || 1)
      const lapMs = kmPaceToLapMs(r.kmMin, r.kmSec)
      if (lapMs <= 0) continue
      for (let k = 0; k < planned; k++) {
        sched.push({ runnerId: r.id, runnerName: r.name, runnerColor: r.color, durationMs: lapMs })
      }
    }
    return sched
  }

  // Project marker / lap count / current runner from race elapsed against planned schedule.
  function projectFromSchedule(t: TeamFull, elapsed: number) {
    const sched = buildSchedule(t)
    if (sched.length === 0) {
      return { lapCount: 0, currentRunner: null as Runner | null, runnerLapsCount: 0, progress: 0, expectedLapMs: kmPaceToLapMs(6, 0) }
    }
    const cycleMs = sched.reduce((a, s) => a + s.durationMs, 0)
    if (cycleMs <= 0) {
      return { lapCount: 0, currentRunner: null as Runner | null, runnerLapsCount: 0, progress: 0, expectedLapMs: kmPaceToLapMs(6, 0) }
    }
    const cyclesDone = Math.floor(elapsed / cycleMs)
    const intoCycleMs = elapsed - cyclesDone * cycleMs
    let acc = 0
    let lapInCycle = 0
    let currentSched = sched[0]
    for (let i = 0; i < sched.length; i++) {
      const s = sched[i]
      if (intoCycleMs < acc + s.durationMs) {
        lapInCycle = i
        currentSched = s
        break
      }
      acc += s.durationMs
    }
    const lapCount = cyclesDone * sched.length + lapInCycle
    const intoLapMs = intoCycleMs - acc
    const progress = currentSched.durationMs > 0 ? intoLapMs / currentSched.durationMs : 0
    const currentRunner = (t.runners || []).find((r) => r.id === currentSched.runnerId) || null
    // Count laps the current runner has done in the projected schedule so far
    let runnerLapsCount = 0
    for (let c = 0; c < cyclesDone; c++) {
      runnerLapsCount += sched.filter((s) => s.runnerId === currentSched.runnerId).length
    }
    for (let i = 0; i < lapInCycle; i++) {
      if (sched[i].runnerId === currentSched.runnerId) runnerLapsCount++
    }
    return { lapCount, currentRunner, runnerLapsCount, progress, expectedLapMs: currentSched.durationMs }
  }

  function projectTeam(t: TeamFull) {
    const elapsed = raceStarted && raceStartTime ? Math.max(0, now - raceStartTime) : 0
    return projectFromSchedule(t, elapsed)
  }

  const markers = (teams || [])
    .filter(t => t.ready)
    .map(t => {
      const proj = projectTeam(t)
      return {
        id: t._id,
        color: t.color || TEAM_COLOR_PALETTE[0],
        progress: raceStarted ? proj.progress : 0,
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
                  const proj = projectTeam(t)
                  const current = proj.currentRunner
                  const teamTotalLaps = raceStarted ? proj.lapCount : 0
                  const runnerLaps = raceStarted ? proj.runnerLapsCount : 0
                  const pace = current ? fmtKmPace(current.kmMin, current.kmSec) : '—'
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