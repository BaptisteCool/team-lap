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
  gender?: string
}

interface SetupScreenProps {
  team: TeamInfo
  setTeam: React.Dispatch<React.SetStateAction<TeamInfo>>
  runners: Runner[]
  setRunners: React.Dispatch<React.SetStateAction<Runner[]>>
  onContinue: () => void
  minLapSec?: number
  maxLapSec?: number
  // Event-level capacity (uniform across all teams of the event). Default 10.
  maxRunnersPerTeam?: number
  // False once race started → delete is locked (integrity of laps / currentIdx / ranking)
  canDeleteRunner?: boolean
}

export function SetupScreen({ team, setTeam, runners, setRunners, onContinue, minLapSec = 165, maxLapSec = 480, maxRunnersPerTeam, canDeleteRunner = true }: SetupScreenProps) {
  const [editPaceFor, setEditPaceFor] = React.useState<{ runnerId: string; min: number; sec: number } | null>(null)
  const [editPlannedFor, setEditPlannedFor] = React.useState<string | null>(null)
  const [addRunnerOpen, setAddRunnerOpen] = React.useState(false)
  const [addPseudo, setAddPseudo] = React.useState('')
  const [addGender, setAddGender] = React.useState<'Homme' | 'Femme' | 'Autre'>('Homme')
  const [addPaceMin, setAddPaceMin] = React.useState(5)
  const [addPaceSec, setAddPaceSec] = React.useState(0)
  const [addPlanned, setAddPlanned] = React.useState(4)
  // Compact mm:ss formatter for bounds display (no centiseconds)
  const fmtMmSs = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`
  // Source of truth: event.maxRunnersPerTeam. Fallback team.maxRunners (legacy) then 10.
  const maxRunners = maxRunnersPerTeam ?? team?.maxRunners ?? 10
  // Capacity counts active + uncertain (excludes 'out' / abandon)
  const activeCount = runners.filter(r => r.status !== 'out').length
  const atCap = activeCount >= maxRunners

  function updateRunner(id: string, patch: Partial<Runner>) {
    setRunners(rs => rs.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }

  function openAddRunner() {
    if (atCap) return
    setAddPseudo('')
    setAddGender('Homme')
    setAddPaceMin(5)
    setAddPaceSec(0)
    setAddPlanned(DEFAULT_PLANNED_LAPS || 4)
    setAddRunnerOpen(true)
  }

  function commitAddRunner() {
    const palette = RUNNER_PALETTE || ['#A6F060', '#60D9F0', '#F0A860', '#D060F0', '#F06080', '#F0E060', '#80F0C8', '#F08060']
    const id = 'r' + Date.now().toString(36)
    setRunners(rs => [
      ...rs,
      {
        id,
        name: addPseudo.trim(),
        kmMin: addPaceMin,
        kmSec: addPaceSec,
        color: palette[rs.length % palette.length],
        energy: 100,
        status: 'ready',
        liveKmMin: null,
        liveKmSec: null,
        plannedLaps: addPlanned,
        gender: addGender,
      },
    ])
    setAddRunnerOpen(false)
  }

  function removeRunner(id: string) {
    if (!canDeleteRunner) return
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
                    placeholder="Pseudo"
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
                    {maxRunners}
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
            <h3>Coureurs · {activeCount} / {maxRunners} actifs</h3>
            <button
              className="btn primary"
              style={{ marginLeft: 'auto' }}
              onClick={openAddRunner}
              disabled={atCap}
              title={atCap ? `Capacité atteinte (${activeCount}/${maxRunners} actifs)` : undefined}
            >
              ➕ Ajouter
            </button>
          </div>
          <div className="card-body">
            {runners.length === 0 && <div className="empty">Ajoutez au moins 2 coureurs pour démarrer.</div>}
            {atCap && (
              <div className="hint" style={{ color: 'var(--warn)', marginBottom: 8 }}>
                Capacité atteinte ({activeCount}/{maxRunners} actifs). Marquez un coureur en abandon pour libérer un slot.
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
                        placeholder="Pseudo"
                        style={{ fontSize: 15, fontWeight: 500 }}
                      />
                      <button
                        className="btn ghost icon"
                        onClick={() => removeRunner(r.id)}
                        disabled={!canDeleteRunner}
                        title={canDeleteRunner ? 'Supprimer' : 'Suppression impossible : la course a démarré. Marquez en abandon à la place.'}
                        style={!canDeleteRunner ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                      >
                        🗑
                      </button>
                    </div>
                    <div style={{ padding: '0 12px 12px', display: 'grid', gridTemplateColumns: '180px 110px 1fr', gap: 14 }}>
                      <div className="field">
                        <span className="field-label">Allure / km (estimée)</span>
                        {(r.kmMin > 0 || r.kmSec > 0) ? (
                          <button
                            type="button"
                            onClick={() => setEditPaceFor({ runnerId: r.id, min: r.kmMin, sec: r.kmSec })}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              background: 'var(--bg-2)',
                              border: '1px solid var(--border)',
                              borderRadius: 8,
                              padding: '8px 12px',
                              cursor: 'pointer',
                              font: 'inherit',
                              color: 'inherit',
                              textAlign: 'left',
                            }}
                            title="Modifier l'allure"
                          >
                            <span className="mono" style={{ fontSize: 14, fontWeight: 600 }}>
                              {r.kmMin}:{String(r.kmSec).padStart(2, '0')}/km
                            </span>
                            <span className="mono" style={{ color: 'var(--muted)', fontSize: 12 }}>
                              ≈ {fmtLap(lapMs)} / tour
                            </span>
                            <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 11 }}>✎</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn"
                            onClick={() => setEditPaceFor({ runnerId: r.id, min: 5, sec: 0 })}
                            style={{ fontSize: 13 }}
                          >
                            ➕ Ajouter une allure
                          </button>
                        )}
                      </div>
                      <div className="field" style={{ position: 'relative' }}>
                        <span className="field-label">Tours prévus</span>
                        <span
                          onClick={() => setEditPlannedFor((cur) => (cur === r.id ? null : r.id))}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            cursor: 'pointer',
                            padding: '8px 12px',
                            background: 'var(--bg-2)',
                            border: '1px solid var(--border)',
                            borderRadius: 8,
                          }}
                          className="mono"
                          title="Cliquer pour modifier"
                        >
                          <strong style={{ fontSize: 14 }}>×{r.plannedLaps ?? 1}</strong>
                          <span style={{ opacity: 0.5, fontSize: 11 }}>✎</span>
                        </span>
                        {editPlannedFor === r.id && (
                          <div
                            style={{
                              position: 'absolute',
                              left: 0,
                              top: '100%',
                              marginTop: 4,
                              zIndex: 20,
                              background: 'var(--surface)',
                              border: '1px solid var(--border)',
                              borderRadius: 8,
                              padding: 6,
                              display: 'flex',
                              gap: 4,
                              alignItems: 'center',
                              boxShadow: '0 8px 22px -8px rgba(0,0,0,0.5)',
                            }}
                          >
                            <button
                              className="btn"
                              style={{ padding: '4px 12px', fontSize: 16, fontWeight: 700 }}
                              onClick={() => updateRunner(r.id, { plannedLaps: (r.plannedLaps || 1) + 1 })}
                              title="Augmenter"
                            >
                              +
                            </button>
                            <button
                              className="btn"
                              style={{ padding: '4px 12px', fontSize: 16, fontWeight: 700 }}
                              disabled={(r.plannedLaps || 1) <= 1}
                              onClick={() => updateRunner(r.id, { plannedLaps: Math.max(1, (r.plannedLaps || 1) - 1) })}
                              title="Diminuer (mini 1)"
                            >
                              −
                            </button>
                            <button
                              className="btn ghost icon"
                              style={{ padding: 4, fontSize: 12 }}
                              onClick={() => setEditPlannedFor(null)}
                              title="Fermer"
                            >
                              ✕
                            </button>
                          </div>
                        )}
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

      {addRunnerOpen && (() => {
        const lapMs = kmPaceToLapMs(addPaceMin, addPaceSec)
        const minMs = minLapSec * 1000
        const maxMs = maxLapSec * 1000
        const paceValid = lapMs >= minMs && lapMs <= maxMs
        const valid = !!addPseudo.trim() && paceValid && addPlanned >= 1
        return (
          <div className="modal-backdrop" onClick={() => setAddRunnerOpen(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <h3>Ajouter un coureur</h3>
                <button className="btn ghost icon" style={{ marginLeft: 'auto' }} onClick={() => setAddRunnerOpen(false)}>✕</button>
              </div>
              <div className="modal-body grid" style={{ gap: 12 }}>
                <div className="field">
                  <span className="field-label">Pseudo *</span>
                  <input
                    type="text"
                    required
                    value={addPseudo}
                    onChange={(e) => setAddPseudo(e.target.value)}
                    placeholder="Pseudo"
                    autoFocus
                  />
                </div>
                <div className="field">
                  <span className="field-label">Genre *</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['Homme', 'Femme', 'Autre'] as const).map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setAddGender(g)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 8,
                          border: '1px solid ' + (addGender === g ? 'var(--accent)' : 'var(--border)'),
                          background: addGender === g ? 'oklch(0.86 0.20 135 / 0.18)' : 'var(--bg-2)',
                          color: addGender === g ? 'oklch(0.92 0.20 135)' : 'var(--text-2)',
                          fontSize: 13,
                          cursor: 'pointer',
                        }}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <span className="field-label">Allure /km (min : sec) *</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="number"
                      min="0"
                      max="20"
                      required
                      className="mono"
                      value={addPaceMin}
                      onChange={(e) => setAddPaceMin(Math.max(0, +e.target.value || 0))}
                      style={{ width: 70, textAlign: 'center' }}
                    />
                    <span>:</span>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      required
                      className="mono"
                      value={addPaceSec}
                      onChange={(e) => setAddPaceSec(Math.min(59, Math.max(0, +e.target.value || 0)))}
                      style={{ width: 70, textAlign: 'center' }}
                    />
                  </div>
                  {!paceValid && (
                    <div className="hint" style={{ color: 'oklch(0.85 0.16 25)', marginTop: 4 }}>
                      Tour estimé hors bornes admin ({fmtMmSs(minMs)} → {fmtMmSs(maxMs)}).
                    </div>
                  )}
                </div>
                <div className="field">
                  <span className="field-label">Tours prévus *</span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button type="button" className="btn" style={{ padding: '4px 12px', fontSize: 16 }} onClick={() => setAddPlanned((n) => Math.max(1, n - 1))}>−</button>
                    <input
                      type="number"
                      min="1"
                      max="40"
                      required
                      className="mono"
                      value={addPlanned}
                      onChange={(e) => setAddPlanned(Math.max(1, Math.min(40, +e.target.value || 1)))}
                      style={{ width: 80, textAlign: 'center' }}
                    />
                    <button type="button" className="btn" style={{ padding: '4px 12px', fontSize: 16 }} onClick={() => setAddPlanned((n) => Math.min(40, n + 1))}>+</button>
                  </div>
                </div>
              </div>
              <div className="modal-foot">
                <button className="btn ghost" onClick={() => setAddRunnerOpen(false)}>Annuler</button>
                <button className="btn primary" disabled={!valid} onClick={commitAddRunner}>
                  ✓ Ajouter
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {editPaceFor && (() => {
        const lapMs = kmPaceToLapMs(editPaceFor.min, editPaceFor.sec)
        const minMs = minLapSec * 1000
        const maxMs = maxLapSec * 1000
        const valid = lapMs >= minMs && lapMs <= maxMs
        const tooFast = lapMs > 0 && lapMs < minMs
        const tooSlow = lapMs > maxMs
        const runner = runners.find(rr => rr.id === editPaceFor.runnerId)
        return (
          <div className="modal-backdrop" onClick={() => setEditPaceFor(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <h3>Allure cible · {runner?.name || ''}</h3>
                <button className="btn ghost icon" style={{ marginLeft: 'auto' }} onClick={() => setEditPaceFor(null)}>✕</button>
              </div>
              <div className="modal-body grid" style={{ gap: 12 }}>
                <div className="hint">Saisissez l'allure cible /km. Sera utilisée pour les estimations et la projection des passages.</div>
                <div className="field">
                  <span className="field-label">Allure /km (min : sec)</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="number"
                      min="0"
                      max="20"
                      className="mono"
                      value={editPaceFor.min}
                      onChange={(e) => setEditPaceFor({ ...editPaceFor, min: Math.max(0, +e.target.value || 0) })}
                      style={{ width: 80, textAlign: 'center', fontSize: 18 }}
                    />
                    <span style={{ fontSize: 20, color: 'var(--muted)' }}>:</span>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      className="mono"
                      value={editPaceFor.sec}
                      onChange={(e) => setEditPaceFor({ ...editPaceFor, sec: Math.min(59, Math.max(0, +e.target.value || 0)) })}
                      style={{ width: 80, textAlign: 'center', fontSize: 18 }}
                    />
                    <span style={{ marginLeft: 8, color: 'var(--muted)', fontSize: 13 }}>min : sec /km</span>
                  </div>
                </div>
                {(() => {
                  // Convert lap-time bounds back to pace /km for clearer hint
                  const minPaceSec = Math.ceil(minLapSec / 0.9) // 165 / 0.9 = 183s = 3:03/km
                  const maxPaceSec = Math.floor(maxLapSec / 0.9) // 480 / 0.9 = 533s = 8:53/km
                  const fmtPaceMmSs = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
                  return (
                    <>
                      <div className="hint mono">
                        Tour estimé : <strong>{fmtMmSs(lapMs)}</strong> · bornes tour <strong>{fmtMmSs(minMs)} → {fmtMmSs(maxMs)}</strong>
                      </div>
                      <div className="hint mono">
                        Allure autorisée : <strong>{fmtPaceMmSs(minPaceSec)}/km → {fmtPaceMmSs(maxPaceSec)}/km</strong>
                      </div>
                      {tooFast && <div className="hint" style={{ color: 'oklch(0.85 0.16 25)' }}>⚠️ Allure trop rapide — minimum {fmtPaceMmSs(minPaceSec)}/km (tour {fmtMmSs(minMs)}).</div>}
                      {tooSlow && <div className="hint" style={{ color: 'oklch(0.85 0.16 25)' }}>⚠️ Allure trop lente — maximum {fmtPaceMmSs(maxPaceSec)}/km (tour {fmtMmSs(maxMs)}).</div>}
                    </>
                  )
                })()}
              </div>
              <div className="modal-foot">
                <button className="btn ghost" onClick={() => setEditPaceFor(null)}>Annuler</button>
                <button
                  className="btn primary"
                  disabled={!valid}
                  onClick={() => {
                    updateRunner(editPaceFor.runnerId, { kmMin: editPaceFor.min, kmSec: editPaceFor.sec })
                    setEditPaceFor(null)
                  }}
                >
                  ✓ Enregistrer
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}