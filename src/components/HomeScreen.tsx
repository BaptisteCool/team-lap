import { useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '../convex/hooks'
import { useVirtualClock } from '../hooks/useVirtualClock'
import { fmtClock, fmtKmPace, kmPaceToLapMs, TEAM_COLOR_PALETTE } from '../lib/race-data'
import { GpxMap } from './GpxMap'
import { TestModeBadge } from './TestModeBadge'
import { TestModeTimelapseSlider } from './TestModeTimelapseSlider'

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
  eventSlug: string
  onPickTeam: (teamId: string) => void
}

export function HomeScreen({ eventSlug, onPickTeam }: HomeScreenProps) {
  const navigate = useNavigate()
  const [now, setNow] = useState(Date.now())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    intervalRef.current = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(intervalRef.current!)
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
  const event = useQuery('events:getBySlug' as any, { slug: eventSlug }) as any

  // Presence heartbeat — required to keep server-side burst chain alive
  // (scheduleNextAutoBurst exits early when hasViewers === false).
  const presenceBeatMutation = useMutation('presence:beat' as any)
  useEffect(() => {
    if (!event?._id) return
    const sessionId = (() => {
      try {
        const k = 'teamlap.presence.sessionId'
        let v = sessionStorage.getItem(k)
        if (!v) {
          v = (crypto as any)?.randomUUID
            ? crypto.randomUUID()
            : 's_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
          sessionStorage.setItem(k, v)
        }
        return v
      } catch (_) {
        return 's_fallback_' + Math.random().toString(36).slice(2)
      }
    })()
    let cancelled = false
    const tick = () => {
      if (cancelled) return
      presenceBeatMutation({ eventId: event._id, sessionId, context: 'home' }).catch(
        (err: any) => console.warn('presence beat failed', err),
      )
    }
    tick()
    const id = setInterval(tick, 30_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [event?._id, presenceBeatMutation])

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

  // Virtual clock for testMode scrubbing
  const testMode = (event as any)?.testMode === true
  const startTime = event?.actualStart ?? Date.now()
  const testModeDivider = (event as any)?.testModeDivider || 3
  const { virtualNow, setVirtualNow, isLive, goLive } = useVirtualClock(startTime, testModeDivider)

  // effectiveNow: virtualNow in testMode (scrub), real now otherwise
  const effectiveNow = testMode ? virtualNow : now

  const raceStarted = event?.status === 'running'
  const raceStartTime = event?.actualStart || null
  const elapsedMs = raceStarted && raceStartTime ? Math.max(0, effectiveNow - raceStartTime) : 0

  // Laps filtered by virtualNow in testMode — memoised for performance
  const filteredLaps = useMemo(() => {
    if (!allLaps) return null
    if (!testMode) return allLaps
    return allLaps.filter((l: any) => l.timestamp <= virtualNow)
  }, [allLaps, testMode, virtualNow])

  // Relay ticks: timestamps of relay laps for the slider ticks
  const relayTicks = useMemo<number[]>(() => {
    if (!allLaps) return []
    return allLaps
      .filter((l: any) => l.type === 'relay_manual' || l.type === 'relay_auto')
      .map((l: any) => l.timestamp as number)
      .sort((a: number, b: number) => a - b)
  }, [allLaps])

  // Index laps per team (from filteredLaps)
  const lapsByTeam = useMemo(() => {
    const map = new Map<string, any[]>()
    if (filteredLaps) {
      for (const l of filteredLaps) {
        if (!map.has(l.teamId)) map.set(l.teamId, [])
        map.get(l.teamId)!.push(l)
      }
    }
    return map
  }, [filteredLaps])

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

  const markers = useMemo(() => (teams || [])
    .filter(t => t.ready)
    .map(t => {
      const tLaps = (lapsByTeam.get(t._id) || []).filter((l) => l.type !== 'position').slice().sort((a, b) => a.timestamp - b.timestamp)
      const lastLap = tLaps.length ? tLaps[tLaps.length - 1] : null
      const lastLapAt = lastLap ? lastLap.timestamp : raceStartTime
      const dbCurrent = getDbCurrentRunner(t)
      const relayTransitionMs = ((event as any)?.relayTransitionSec ?? 5) * 1000
      const minLapMsHome = (event?.minLapSec ?? 5) * 1000
      const maxLapMsHome = (event?.maxLapSec ?? 3600) * 1000
      const evTestMode = (event as any)?.testMode === true
      const evTestDivider = (event as any)?.testModeDivider || 3
      const compress = evTestMode && evTestDivider > 0 ? evTestDivider : 1
      const lapDistHome = (event as any)?.lapDistance || 900
      const expectedLapMs = (() => {
        const peek = (t as any).nextExpectedLapMs
        if (peek && peek > 0) return peek
        if (lastLap && lastLap.lapTime > 0) {
          const wasRelay = lastLap.type === 'relay_manual' || lastLap.type === 'relay_auto'
          const adjusted = wasRelay ? Math.max(1000, lastLap.lapTime - relayTransitionMs) : lastLap.lapTime
          return adjusted
        }
        let baseMs: number
        if (!dbCurrent) baseMs = kmPaceToLapMs(6, 0, lapDistHome)
        else if (dbCurrent.liveKmMin != null && dbCurrent.liveKmSec != null) {
          const liveLapMs = kmPaceToLapMs(dbCurrent.liveKmMin, dbCurrent.liveKmSec, lapDistHome)
          baseMs = liveLapMs >= minLapMsHome && liveLapMs <= maxLapMsHome
            ? liveLapMs
            : kmPaceToLapMs(dbCurrent.kmMin, dbCurrent.kmSec, lapDistHome)
        } else {
          baseMs = kmPaceToLapMs(dbCurrent.kmMin, dbCurrent.kmSec, lapDistHome)
        }
        return baseMs / compress
      })()
      const firstLapDistHome = (event as any)?.firstLapDistanceM || lapDistHome
      const startOffset = firstLapDistHome > 0 && firstLapDistHome < lapDistHome
        ? (lapDistHome - firstLapDistHome) / lapDistHome
        : 0
      let progress = startOffset
      const inHandoverWindow = false
      const handoverRemainingSec = 0
      if (raceStarted && lastLapAt && expectedLapMs > 0) {
        const elapsedSinceLast = effectiveNow - lastLapAt
        if (tLaps.length === 0 && startOffset > 0) {
          const tFrac = Math.min(1, elapsedSinceLast / expectedLapMs)
          progress = (startOffset + tFrac * (1 - startOffset)) % 1
        } else {
          progress = (elapsedSinceLast / expectedLapMs) % 1
        }
        if (progress < 0) progress = 0
      }
      if (t.autoPaused) progress = 0.92
      if ((t as any).finishedAt) progress = 1
      let subLabel: string | undefined
      const testDivider = (event as any)?.testModeDivider || 3
      const paceMul = testMode && testDivider > 0 ? testDivider : 1
      if (dbCurrent && !(t as any).finishedAt) {
        const nameShort = (dbCurrent.name || '').slice(0, 4)
        let lapsThisStint = 0
        for (let i = tLaps.length - 1; i >= 0; i--) {
          const l = tLaps[i]
          if (l.type === 'relay_manual' || l.type === 'relay_auto') break
          if (l.runnerId === dbCurrent.id) lapsThisStint++
        }
        const plannedLapsSub = dbCurrent.plannedLaps
        const lapsTxt = plannedLapsSub && plannedLapsSub > 0
          ? `${lapsThisStint + 1}/${plannedLapsSub}`
          : `${lapsThisStint + 1}`
        const currentLapNumber = (typeof lastLap?.lapNumber === 'number' ? lastLap.lapNumber : 0) + 1
        const extras: string[] = [`T${currentLapNumber}`]
        const refLapMsRunner = (t as any).nextExpectedLapMs || lastLap?.lapTime || 0
        if (refLapMsRunner > 0) {
          const realLapMs = refLapMsRunner * paceMul
          const totalSec = Math.round(realLapMs / 1000)
          const lm = Math.floor(totalSec / 60)
          const ls = totalSec % 60
          extras.push(`${lm}:${String(ls).padStart(2, '0')}`)
          const paceSecPerKm = realLapMs / 1000 / 0.9
          const pm = Math.floor(paceSecPerKm / 60)
          const ps = Math.round(paceSecPerKm) % 60
          extras.push(`${pm}'${String(ps).padStart(2, '0')}/km`)
        }
        if (lastLap && typeof (lastLap as any).rang === 'number') extras.push(`R${(lastLap as any).rang}`)
        const currentChronoId = (t as any).nextExpectedChronoplaceId
          ?? ((lastLap as any)?.chronoplaceId)
        if (evTestMode && typeof currentChronoId === 'number') {
          extras.push(`#${currentChronoId}`)
        }
        subLabel = `${nameShort} ${lapsTxt} · ${extras.join(' · ')}`
      } else if (!(t as any).finishedAt) {
        const lastLapHere = tLaps.length > 0 ? tLaps[tLaps.length - 1] : null
        const refLapMs = (t as any).nextExpectedLapMs || lastLapHere?.lapTime || 0
        const parts: string[] = []
        const currentLapNumber = (typeof lastLapHere?.lapNumber === 'number' ? lastLapHere.lapNumber : 0) + 1
        parts.push(`T${currentLapNumber}`)
        if (refLapMs > 0) {
          const realLapMs = refLapMs * paceMul
          const totalSec = Math.round(realLapMs / 1000)
          const lm = Math.floor(totalSec / 60)
          const ls = totalSec % 60
          const lapTimeTxt = `${lm}:${String(ls).padStart(2, '0')}`
          const paceSecPerKm = realLapMs / 1000 / 0.9
          const pm = Math.floor(paceSecPerKm / 60)
          const ps = Math.round(paceSecPerKm) % 60
          const paceTxt = `${pm}'${String(ps).padStart(2, '0')}/km`
          parts.push(lapTimeTxt, paceTxt)
        }
        if (lastLapHere && typeof (lastLapHere as any).rang === 'number') parts.push(`R${(lastLapHere as any).rang}`)
        const currentChronoIdNo = (t as any).nextExpectedChronoplaceId
          ?? ((lastLapHere as any)?.chronoplaceId)
        if (evTestMode && typeof currentChronoIdNo === 'number') {
          parts.push(`#${currentChronoIdNo}`)
        }
        subLabel = parts.join(' · ')
      }
      return {
        id: t._id,
        color: t.color || TEAM_COLOR_PALETTE[0],
        progress,
        label: (t as any).finishedAt
          ? `${t.name || ''} · 🏁`
          : inHandoverWindow
            ? `${t.name || ''} · 🤝 ${handoverRemainingSec}s`
            : (t.name || ''),
        subLabel,
      }
    }), [teams, lapsByTeam, raceStarted, raceStartTime, effectiveNow, event, testMode])

  return (
    <div className="page">
      <TestModeBadge testMode={(event as any)?.testMode} testModeDivider={(event as any)?.testModeDivider} />
      <div className="grid" style={{ gap: 18, maxWidth: 980, margin: '0 auto' }}>
        {/* Carte circuit en haut */}
        <div className="card">
          <div className="card-head">
            <span>🗺️</span>
            <h3>Circuit · live</h3>
            <span className="badge" style={{ marginLeft: 'auto' }}>{(event as any)?.lapDistance ?? 900} m / tour</span>
            <span className={`badge ${raceStarted ? 'accent' : ''}`}>
              {raceStarted ? `LIVE · ${fmtClock(elapsedMs)}` : 'Course non démarrée'}
            </span>
          </div>
          <div className="card-body">
            <GpxMap height={420} markers={markers} showLabel lapDistanceM={(event as any)?.lapDistance ?? 900} />
            {testMode && raceStarted && (
              <TestModeTimelapseSlider
                testMode={testMode}
                startTime={startTime}
                virtualNow={virtualNow}
                setVirtualNow={setVirtualNow}
                isLive={isLive}
                goLive={goLive}
                relayTicks={relayTicks}
              />
            )}
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
                          const lapMs = kmPaceToLapMs(current.liveKmMin, current.liveKmSec, (event as any)?.lapDistance || 900)
                          const minMs = (event?.minLapSec ?? 5) * 1000
                          const maxMs = (event?.maxLapSec ?? 3600) * 1000
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
                            {current?.status === 'uncertain' && (
                              <span
                                style={{
                                  fontSize: 9,
                                  padding: '1px 5px',
                                  borderRadius: 4,
                                  background: 'oklch(0.82 0.17 70 / 0.18)',
                                  color: 'oklch(0.82 0.17 70)',
                                  border: '1px solid oklch(0.82 0.17 70 / 0.5)',
                                  flexShrink: 0,
                                }}
                                title="Coureur incertain"
                              >
                                ?
                              </span>
                            )}
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
