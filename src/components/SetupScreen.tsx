import React from 'react'
import {
  DEFAULT_PLANNED_LAPS,
  kmPaceToLapMs,
  LAP_DISTANCE_M,
  RUNNER_PALETTE,
} from '../lib/race-data'
import { EnergySegment } from './EnergySegment'
import { StatusSegment } from './StatusSegment'

interface TeamInfo {
  name: string
  maxRunners: number
  category: string
  goalLaps: number
  color: string
  profileImage?: string
  contactName?: string
  contactPhone?: string
}

interface Runner {
  id: string
  name: string
  kmMin: number
  kmSec: number
  color: string
  energy: number
  status: string
  liveKmMin: number | null
  liveKmSec: number | null
  plannedLaps: number
}

interface SetupScreenProps {
  team: TeamInfo
  setTeam: React.Dispatch<React.SetStateAction<TeamInfo>>
  runners: Runner[]
  setRunners: React.Dispatch<React.SetStateAction<Runner[]>>
  onContinue: () => void
}

export function SetupScreen({ team, setTeam, runners, setRunners, onContinue }: SetupScreenProps) {
  const maxRunners = team?.maxRunners || 30
  const atCap = runners.length >= maxRunners

  function updateRunner(id: string, patch: Partial<Runner>) {
    setRunners(rs => rs.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }

  function addRunner() {
    if (atCap) return
    const palette = RUNNER_PALETTE || ['#A6F060', '#60D9F0', '#F0A860', '#D060F0', '#F06080', '#F0E060', '#80F0C8', '#F08060']
    const id = 'r' + Date.now().toString(36)
    setRunners(rs => [
      ...rs,
      {
        id,
        name: '',
        kmMin: 5,
        kmSec: 0,
        color: palette[rs.length % palette.length],
        energy: 100,
        status: 'ready',
        liveKmMin: null,
        liveKmSec: null,
        plannedLaps: DEFAULT_PLANNED_LAPS || 4,
      },
    ])
  }

  function removeRunner(id: string) {
    const r = runners.find(x => x.id === id)
    const name = r && r.name ? r.name : 'ce coureur'
    if (
      !window.confirm(
        `Supprimer ${name} de l'équipe ?\n\nSes éventuels tours déjà enregistrés resteront dans l'historique mais ne pourront plus être réattribués automatiquement.`
      )
    )
      return
    setRunners(rs => rs.filter(r => r.id !== id))
  }

  // Team stats — only count active (non-out) runners
  const active = runners.filter(r => r.status !== 'out')
  const totalLapMs = active.reduce((acc, r) => acc + kmPaceToLapMs(r.kmMin, r.kmSec), 0)
  const avgLapMs = active.length ? totalLapMs / active.length : 0
  const projectedLaps = avgLapMs ? Math.floor((24 * 3600 * 1000) / avgLapMs) : 0
  const projectedKm = ((projectedLaps * LAP_DISTANCE_M) / 1000).toFixed(1)

  const ready = team.name.trim() && active.length >= 2 && runners.every(r => r.name.trim())

  // Helper function to format pace
  function fmtPace(ms: number): string {
    if (!ms || ms <= 0) return '—'
    const secPerKm = (ms / 1000) * (1000 / LAP_DISTANCE_M)
    const m = Math.floor(secPerKm / 60)
    const s = Math.round(secPerKm % 60)
    return `${m}:${String(s).padStart(2, '0')}/km`
  }

  // Helper function to format lap time
  function fmtLap(ms: number): string {
    if (!ms || ms <= 0) return '—'
    const totalSec = Math.floor(ms / 1000)
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    const cs = Math.floor((ms % 1000) / 10)
    return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
  }

  return (
    <div className="page">
      <div className="grid setup-grid">
        {/* Left column — team identity + stats + circuit */}
        <div className="grid" style={{ gap: 18, alignContent: 'start' }}>
          <div className="card" style={{ borderLeft: `4px solid ${team.color || 'var(--accent)'}` }}>
            <div className="card-head">
              <span>🏁</span>
              <h3>Identité de l'équipe</h3>
              <span className="badge" style={{ marginLeft: 'auto', fontSize: 10 }}>
                Lecture seule · réglé en admin
              </span>
            </div>
            <div className="card-body grid" style={{ gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {team.profileImage ? (
                  <img
                    src={team.profileImage}
                    alt={team.name}
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      objectFit: 'cover',
                      border: '1px solid var(--border)',
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      background: team.color || 'var(--accent)',
                      color: '#0a0e0c',
                      display: 'grid',
                      placeItems: 'center',
                      fontWeight: 700,
                      fontSize: 22,
                      flexShrink: 0,
                    }}
                    className="mono"
                  >
                    {team.name ? team.name.charAt(0).toUpperCase() : '?'}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {team.name || '(sans nom)'}
                  </div>
                  <div className="hint" style={{ marginTop: 2 }}>
                    Couleur <span className="mono" style={{ color: 'var(--text-2)' }}>{team.color || '—'}</span>
                  </div>
                </div>
              </div>
              <div>
                <span className="field-label">Image de profil (optionnel)</span>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
                  <div style={{ flex: 1 }}>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (file) {
                          const reader = new FileReader()
                          reader.onload = (event) => {
                            const result = event.target?.result as string
                            setTeam(t => ({ ...t, profileImage: result }))
                          }
                          reader.readAsDataURL(file)
                        }
                      }}
                      style={{ fontSize: 12 }}
                    />
                    {team.profileImage && (
                      <button
                        onClick={() => setTeam(t => ({ ...t, profileImage: undefined }))}
                        style={{
                          marginTop: 4,
                          fontSize: 11,
                          padding: '4px 8px',
                          background: 'var(--bg-2)',
                          border: '1px solid var(--border)',
                          borderRadius: 4,
                          cursor: 'pointer',
                        }}
                      >
                        Supprimer l'image
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="field">
                  <span className="field-label">Référent équipe (optionnel)</span>
                  <input
                    type="text"
                    value={team.contactName || ''}
                    onChange={e => setTeam(t => ({ ...t, contactName: e.target.value }))}
                    placeholder="Prénom Nom"
                    autoComplete="off"
                  />
                </div>
                <div className="field">
                  <span className="field-label">Téléphone référent (optionnel)</span>
                  <input
                    type="tel"
                    value={team.contactPhone || ''}
                    onChange={e => setTeam(t => ({ ...t, contactPhone: e.target.value }))}
                    placeholder="+33 6 12 34 56 78"
                    autoComplete="off"
                  />
                </div>
              </div>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div className="field">
                  <span className="field-label">Catégorie</span>
                  <div
                    className="mono"
                    style={{
                      padding: '9px 10px',
                      background: 'var(--bg-2)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      fontSize: 14,
                    }}
                  >
                    {team.category || '—'}
                  </div>
                </div>
                <div className="field">
                  <span className="field-label">Objectif (tours)</span>
                  <div
                    className="mono"
                    style={{
                      padding: '9px 10px',
                      background: 'var(--bg-2)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      fontSize: 14,
                    }}
                  >
                    {team.goalLaps || '—'}
                  </div>
                </div>
                <div className="field">
                  <span className="field-label">Max coureurs</span>
                  <div
                    className="mono"
                    style={{
                      padding: '9px 10px',
                      background: 'var(--bg-2)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      fontSize: 14,
                    }}
                  >
                    {team.maxRunners || '—'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <span>🗺️</span>
              <h3>Circuit · 24h de course à pied 2026</h3>
              <span className="badge accent">{LAP_DISTANCE_M} m / tour</span>
            </div>
            <div className="card-body">
              <div className="stat-row" style={{ marginTop: 14 }}>
                <div className="stat">
                  <div className="stat-label">Tour de référence</div>
                  <div className="stat-value mono">{LAP_DISTANCE_M} m</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Allure moy. équipe</div>
                  <div className="stat-value mono">{fmtPace(avgLapMs)}</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Projection 24 h</div>
                  <div className="stat-value mono">
                    {projectedLaps} t · {projectedKm} km
                  </div>
                </div>
              </div>
              <div className="hint" style={{ marginTop: 10 }}>
                Calcul basé uniquement sur les coureurs au statut <em>Prêt</em> ou <em>Incertain</em>.
              </div>
            </div>
          </div>
        </div>

        {/* Right column — runners */}
        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="card-head">
            <span>👥</span>
            <h3>Coureurs · {runners.length} / {maxRunners}</h3>
            <button
              className="btn primary"
              style={{ marginLeft: 'auto' }}
              onClick={addRunner}
              disabled={atCap}
              title={atCap ? `Maximum ${maxRunners} coureurs atteint` : undefined}
            >
              ➕ Ajouter
            </button>
          </div>
          <div className="card-body">
            {runners.length === 0 && <div className="empty">Ajoutez au moins 2 coureurs pour démarrer.</div>}
            {atCap && (
              <div className="hint" style={{ color: 'var(--warn)', marginBottom: 8 }}>
                Maximum de {maxRunners} coureurs atteint (réglé en admin).
              </div>
            )}
            <div className="grid" style={{ gap: 10 }}>
              {runners.map(r => {
                const lapMs = kmPaceToLapMs(r.kmMin, r.kmSec)
                return (
                  <div
                    key={r.id}
                    className="card"
                    style={{
                      background: 'var(--bg-2)',
                      borderRadius: 12,
                      opacity: r.status === 'out' ? 0.55 : 1,
                    }}
                  >
                    <div style={{ padding: 12, display: 'grid', gridTemplateColumns: '28px 1fr 36px', gap: 10, alignItems: 'center' }}>
                      <input
                        type="color"
                        value={r.color}
                        onChange={e => updateRunner(r.id, { color: e.target.value })}
                        style={{
                          width: 24,
                          height: 24,
                          padding: 0,
                          background: r.color,
                          border: '1px solid rgba(255,255,255,0.06)',
                          borderRadius: 6,
                          cursor: 'pointer',
                        }}
                      />
                      <input
                        value={r.name}
                        onChange={e => updateRunner(r.id, { name: e.target.value })}
                        placeholder="Prénom Nom"
                        style={{ fontSize: 15, fontWeight: 500 }}
                      />
                      <button className="btn ghost icon" onClick={() => removeRunner(r.id)} title="Supprimer">
                        🗑
                      </button>
                    </div>
                    <div style={{ padding: '0 12px 12px', display: 'grid', gridTemplateColumns: '180px 110px 1fr', gap: 14 }}>
                      <div className="field">
                        <span className="field-label">Allure / km (estimée)</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input
                            type="number"
                            min="0"
                            max="20"
                            value={r.kmMin}
                            onChange={e => updateRunner(r.id, { kmMin: Math.max(0, +e.target.value || 0) })}
                            style={{ width: 56, textAlign: 'center' }}
                            className="mono"
                          />
                          <span style={{ color: 'var(--muted)' }}>:</span>
                          <input
                            type="number"
                            min="0"
                            max="59"
                            value={r.kmSec}
                            onChange={e => updateRunner(r.id, { kmSec: Math.min(59, Math.max(0, +e.target.value || 0)) })}
                            style={{ width: 56, textAlign: 'center' }}
                            className="mono"
                          />
                          <span className="mono" style={{ color: 'var(--muted)', fontSize: 12, marginLeft: 6 }}>
                            ≈ {fmtLap(lapMs)} / tour
                          </span>
                        </div>
                      </div>
                      <div className="field">
                        <span className="field-label">Tours prévus</span>
                        <input
                          type="number"
                          min="1"
                          max="50"
                          value={r.plannedLaps ?? 1}
                          onChange={e => updateRunner(r.id, { plannedLaps: Math.max(1, +e.target.value || 1) })}
                          style={{ width: 80, textAlign: 'center' }}
                          className="mono"
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div>
                          <span className="field-label" style={{ display: 'block', marginBottom: 4 }}>
                            Énergie
                          </span>
                          <EnergySegment value={r.energy} onChange={v => updateRunner(r.id, { energy: v })} />
                        </div>
                        <div>
                          <span className="field-label" style={{ display: 'block', marginBottom: 4 }}>
                            Statut de course
                          </span>
                          <StatusSegment value={r.status} onChange={v => updateRunner(r.id, { status: v })} />
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <hr className="sep" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="hint">L'allure / km sera ré‑estimée automatiquement à partir des tours réels pendant la course.</span>
              <button className="btn primary" style={{ marginLeft: 'auto' }} disabled={!ready} onClick={onContinue}>
                Étape suivante : planning →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}