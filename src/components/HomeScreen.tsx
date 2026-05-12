import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useQuery } from '../convex/hooks'
import { fmtClock, LAP_DISTANCE_M, TEAM_COLOR_PALETTE } from '../lib/race-data'
import { GpxMap } from './GpxMap'

interface Team {
  _id: string
  name: string
  color: string
  category: string
  maxRunners: number
  goalLaps: number
  ready: boolean
  profileImage?: string
}

interface HomeScreenProps {
  onPickTeam: (teamId: string) => void
  raceStarted: boolean
  raceStartTime: number | null
}

export function HomeScreen({ onPickTeam, raceStarted, raceStartTime }: HomeScreenProps) {
  const navigate = useNavigate()
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Get the event by slug
  const event = useQuery('events:getBySlug' as any, { slug: '24h-brette-les-pins-2026' })
  
  // Get all teams for the event
  const teams = useQuery('teams:getTeams' as any, { eventId: event?._id || 'placeholder' }) as Team[] | null | undefined

  const elapsedMs = raceStarted && raceStartTime ? Math.max(0, now - raceStartTime) : 0

  const markers = (teams || [])
    .filter(t => t.ready)
    .map(t => ({
      id: t._id,
      color: t.color || TEAM_COLOR_PALETTE[0],
      progress: 0.5, // Placeholder progress
      label: t.name || '',
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
                {teams.map(t => (
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
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            objectFit: 'cover',
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            background: t.color || 'var(--accent)',
                            color: '#0a0e0c',
                            display: 'grid',
                            placeItems: 'center',
                            fontWeight: 700,
                          }}
                          className="mono"
                        >
                          {t.name ? t.name.charAt(0).toUpperCase() : '?'}
                        </div>
                      )}
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
                          {t.name || '(sans nom)'}
                        </div>
                        <div className="hint">{t.category}</div>
                      </div>
                      {!raceStarted && t.ready && (
                        <span className="badge accent" style={{ fontSize: 10, padding: '2px 6px' }}>
                          ✓ prêt
                        </span>
                      )}
                      <span>🔒</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--muted)' }} className="mono">
                      <span>{t.maxRunners} coureur(s) max</span>
                      <span>·</span>
                      <span>{t.goalLaps} tours objectif</span>
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