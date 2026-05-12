import { useEffect, useState } from 'react'
import { fmtClock, kmPaceToLapMs, LAP_DISTANCE_M, TEAM_COLOR_PALETTE } from '../lib/race-data'
import { GpxMap } from './GpxMap'

interface Team {
  info: {
    id: string
    name: string
    category: string
    color: string
    ready?: boolean
  }
  runners: any[]
  laps: any[]
  order: any[]
  currentIdx: number
}

interface HomeScreenProps {
  teamsById: Record<string, Team>
  onPickTeam: (teamId: string) => void
  raceStarted: boolean
  raceStartTime: number | null
}

export function HomeScreen({ teamsById, onPickTeam, raceStarted, raceStartTime }: HomeScreenProps) {
  const teams = Object.values(teamsById)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const elapsedMs = raceStarted && raceStartTime ? Math.max(0, now - raceStartTime) : 0

  const markers = teams
    .filter(t => (t.runners || []).length > 0)
    .map(t => ({
      id: t.info.id,
      color: t.info.color || TEAM_COLOR_PALETTE[0],
      progress: computeTeamProgress(t, raceStarted, raceStartTime, now, kmPaceToLapMs),
      label: t.info.name || '',
    }))

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
            <h3>Équipes inscrites · {teams.length}</h3>
          </div>
          <div className="card-body">
            {teams.length === 0 && <div className="empty">Aucune équipe enregistrée.</div>}
            {teams.length > 0 && (
              <div className="grid" style={{ gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
                {teams.map(t => (
                  <button
                    key={t.info.id}
                    onClick={() => onPickTeam(t.info.id)}
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
                      borderLeft: `4px solid ${t.info.color || 'var(--accent)'}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                          background: t.info.color || 'var(--accent)',
                          color: '#0a0e0c',
                          display: 'grid',
                          placeItems: 'center',
                          fontWeight: 700,
                        }}
                        className="mono"
                      >
                        {t.info.name ? t.info.name.charAt(0).toUpperCase() : '?'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 15,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {t.info.name || '(sans nom)'}
                        </div>
                        <div className="hint">{t.info.category}</div>
                      </div>
                      {!raceStarted && t.info?.ready && (
                        <span className="badge accent" style={{ fontSize: 10, padding: '2px 6px' }}>
                          ✓ prêt
                        </span>
                      )}
                      <span>🔒</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--muted)' }} className="mono">
                      <span>{(t.runners || []).length} coureur(s)</span>
                      <span>·</span>
                      <span>{(t.laps || []).length} tour(s)</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Helper function to compute team progress
function computeTeamProgress(
  team: Team,
  raceStarted: boolean,
  raceStartTime: number | null,
  now: number,
  kmPaceToLapMsFn: (kmMin: number, kmSec: number) => number
): number {
  if (!raceStarted || !raceStartTime) return 0
  const laps = team.laps || []
  const order = team.order || []
  const runners = team.runners || []
  if (order.length === 0) return 0

  const lastLapAt = laps.length ? laps[laps.length - 1].timestamp : raceStartTime
  const currentRunnerId = order[(team.currentIdx || 0) % order.length]
  const runner = runners.find((r: any) => r.id === currentRunnerId)
  if (!runner) return 0

  const lastLap = laps.length ? laps[laps.length - 1] : null
  let expectedLapMs: number

  if (runner.liveKmMin != null) {
    expectedLapMs = kmPaceToLapMsFn(runner.liveKmMin, runner.liveKmSec)
  } else if (lastLap && lastLap.runnerId === runner.id) {
    expectedLapMs = lastLap.lapTime
  } else {
    expectedLapMs = kmPaceToLapMsFn(runner.kmMin, runner.kmSec)
  }

  if (!expectedLapMs || expectedLapMs <= 0) return 0

  const elapsed = Math.max(0, now - lastLapAt)
  return elapsed / expectedLapMs
}