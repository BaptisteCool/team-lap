import React, { useMemo, useRef, useState } from 'react'
import { ENERGY_LEVELS, fmtClock, fmtLap, fmtPace, isAutoType, isRelayType, kmPaceToLapMs, toLocalDatetime } from '../lib/race-data'
import { computeLapExpectedMs, computeTeamDelta, deltaToneColor, formatSignedDuration, getDeltaTone } from '../lib/race-calculations'

interface Runner {
  id: string
  name: string
  color: string
  kmMin: number
  kmSec: number
  plannedLaps?: number
}

interface Lap {
  _id?: string
  id: string
  lapNumber: number | null
  runnerId: string
  timestamp: number
  lapTime: number
  type: string
  position?: number
  gapPrev?: string | null
  gapNext?: string | null
  autoRelay?: boolean
  forcedExtra?: boolean
  source?: 'manual' | 'auto' | 'chronoplace'
  chronoplaceId?: number
  correctedByChronoplace?: boolean
}

interface Ranking {
  position: number
  totalTeams?: number
  gapPrevMin?: number
  gapPrevSec?: number
  gapNextMin?: number
  gapNextSec?: number
  history?: Array<{ t: number; pos: number }>
}

interface LapEditPayload {
  runnerId: string
  timestamp: number
  forcedExtra?: boolean
  energy?: number
  type?: 'checkpoint_manual' | 'relay_manual'
}

interface HistoryScreenProps {
  runners: Runner[]
  runnersFull?: Array<{ id: string; energy?: number }>
  laps: Lap[]
  raceStartTime?: number | null
  raceStarted?: boolean
  ranking?: Ranking
  setRanking?: React.Dispatch<React.SetStateAction<Ranking>>
  onAddPosition?: (lap: Lap) => void
  onDeleteLap?: (lapId: string) => void
  onEditLapRunner?: (lapId: string, newRunnerId: string) => void
  onUpdateLap?: (lapId: string, payload: LapEditPayload) => void
  minLapSec?: number
  maxLapSec?: number
  // Relay transition penalty (sec, default 7) — applied to expected times for relay laps
  relayTransitionSec?: number
  lapDistanceM?: number
}

const LAP_PAGE_STEP = 10

const TYPE_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  checkpoint_manual: { label: 'Pass manuel', bg: 'oklch(0.86 0.20 135 / 0.12)', color: 'oklch(0.86 0.20 135)' },
  relay_manual:      { label: 'Relai manuel', bg: 'oklch(0.78 0.18 80 / 0.15)',  color: 'oklch(0.88 0.15 80)' },
  checkpoint_auto:   { label: 'Pass auto',   bg: 'oklch(0.72 0.18 200 / 0.12)', color: 'oklch(0.78 0.16 200)' },
  relay_auto:        { label: 'Relai auto',  bg: 'oklch(0.72 0.21 25 / 0.12)',  color: 'oklch(0.85 0.16 25)' },
  top:               { label: 'Pass',        bg: 'oklch(0.86 0.20 135 / 0.12)', color: 'oklch(0.86 0.20 135)' },
  relay:             { label: 'Relai',       bg: 'oklch(0.78 0.18 80 / 0.15)',  color: 'oklch(0.88 0.15 80)' },
}

export function HistoryScreen({
  runners,
  runnersFull,
  laps,
  raceStartTime,
  raceStarted,
  ranking,
  setRanking,
  onAddPosition,
  onDeleteLap,
  onEditLapRunner,
  onUpdateLap,
  minLapSec = 165,
  maxLapSec = 480,
  relayTransitionSec = 5,
  lapDistanceM = 900,
}: HistoryScreenProps) {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [formMode, setFormMode] = useState<null | { kind: 'edit'; lap: Lap }>(null)
  // Mobile: cycle through lap-time displays — 0=lap time, 1=pace/km, 2=Paris real time, 3=race time
  const [mobileCycle, setMobileCycle] = useState<0 | 1 | 2 | 3>(0)
  const cycleNext = () => setMobileCycle((v) => ((v + 1) % 4) as 0 | 1 | 2 | 3)
  const fmtParisHMS = (ts: number) => {
    const d = new Date(ts)
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Paris' })
  }
  const fmtRaceTime = (ts: number) => raceStartTime ? fmtClock(Math.max(0, ts - raceStartTime)) : '—'
  void onEditLapRunner
  void runnersFull

  const [filterRunnerId, setFilterRunnerId] = useState<string | null>(null)
  // Team delta vs prévisionnel (toujours global, pas affecté par filtre coureur)
  const teamDelta = useMemo(
    () => computeTeamDelta(laps as any, runners as any, relayTransitionSec),
    [laps, runners, relayTransitionSec],
  )
  const teamDeltaTone = getDeltaTone(teamDelta.deltaMs)
  const teamDeltaColor = deltaToneColor(teamDeltaTone)
  const lastDeltaTone = teamDelta.lastLapDeltaMs == null ? 'neutral' : getDeltaTone(teamDelta.lastLapDeltaMs)
  const lastDeltaColor = deltaToneColor(lastDeltaTone)
  // Auto-fallback if filtered runner gets deleted while filter active
  React.useEffect(() => {
    if (filterRunnerId && !runners.find((r) => r.id === filterRunnerId)) {
      setFilterRunnerId(null)
    }
  }, [filterRunnerId, runners])
  const sortedLaps = [...laps]
    .filter((l) => !filterRunnerId || l.runnerId === filterRunnerId)
    .sort((a, b) => b.timestamp - a.timestamp)
  const [pageLimit, setPageLimit] = useState(LAP_PAGE_STEP)

  const getRunner = (id: string) => runners.find((r) => r.id === id)

  const realLaps = sortedLaps.filter((l) => l.type !== 'position')
  const totalLaps = realLaps.length
  const autoCount = realLaps.filter((l) => isAutoType(l.type)).length
  const manualCount = totalLaps - autoCount
  const relayCount = realLaps.filter((l) => isRelayType(l.type)).length
  const avgMs = totalLaps ? realLaps.reduce((a, l) => a + l.lapTime, 0) / totalLaps : 0
  const bestLap = totalLaps ? realLaps.reduce((m, l) => (l.lapTime < m.lapTime ? l : m)) : null

  // Compute per-lap relay position to detect 'tour +' (manual top beyond planned) and 'tour -' (manual relai before planned)
  const lapsAsc = [...laps].filter((l) => l.type !== 'position').sort((a, b) => a.timestamp - b.timestamp)
  const lapBadge: Record<string, 'plus' | 'minus' | null> = {}
  let posInRelay = 0
  for (const l of lapsAsc) {
    posInRelay += 1
    const r = runners.find((x) => x.id === l.runnerId)
    // Prefer per-lap snapshot of planned-at-start (immune to runner config edits later)
    const planned = Math.max(1, (l as any).plannedAtStart ?? r?.plannedLaps ?? 4)
    const isRelay = l.type === 'relay_manual' || l.type === 'relay_auto'
    if (l.forcedExtra) {
      lapBadge[l._id || l.id] = 'plus'
    } else if (l.type === 'checkpoint_manual' && posInRelay > planned) {
      lapBadge[l._id || l.id] = 'plus'
    } else if (l.type === 'relay_manual' && posInRelay < planned) {
      lapBadge[l._id || l.id] = 'minus'
    } else {
      lapBadge[l._id || l.id] = null
    }
    if (isRelay) posInRelay = 0
  }

  // Position chart data (legacy: Recharts → simple inline SVG line chart)
  const positionHistory = (ranking?.history || []).slice().sort((a, b) => b.t - a.t)
  const chartData = ranking && raceStartTime
    ? (ranking.history || []).map((p) => ({ t: Math.round((p.t - raceStartTime) / 60000), pos: p.pos }))
    : []

  return (
    <div className="grid" style={{ gap: 18, maxWidth: 900, margin: '0 auto' }}>
      {/* Ranking card — legacy reproduction */}
      {ranking && setRanking && (
        <div className="card">
          <div className="card-head">
            <span>🏆</span>
            <h3>Classement live</h3>
          </div>
          <div className="card-body">
            <div className="ranking-row">
              <div className="pos-badge">
                <div>
                  <div className="num">{ranking.position}</div>
                  <div className="suffix" style={{ textAlign: 'center' }}>{ranking.position === 1 ? 'er' : 'e'}</div>
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div className="stat-label">Position actuelle</div>
                <div style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 4 }}>
                  Sur {ranking.totalTeams || '—'} équipes inscrites
                </div>
              </div>
              <div className="pos-edit">
                <button className="pos-step" onClick={() => setRanking((r) => ({ ...r, position: Math.max(1, r.position - 1) }))}>▲</button>
                <button className="pos-step" onClick={() => setRanking((r) => ({ ...r, position: r.position + 1 }))}>▼</button>
              </div>
            </div>
            <div className="gaps">
              <div className="gap-cell">
                <div className="gap-l">↑ Écart au précédent <span style={{ color: 'var(--muted)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>· min:sec</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="number" min="0" max="59" className="mono"
                    value={ranking.gapPrevMin || 0}
                    onChange={(e) => setRanking((r) => ({ ...r, gapPrevMin: Math.max(0, +e.target.value || 0) }))}
                    style={{ width: 56, textAlign: 'center' }} />
                  <span style={{ color: 'var(--muted)' }}>:</span>
                  <input type="number" min="0" max="59" className="mono"
                    value={ranking.gapPrevSec || 0}
                    onChange={(e) => setRanking((r) => ({ ...r, gapPrevSec: Math.min(59, Math.max(0, +e.target.value || 0)) }))}
                    style={{ width: 56, textAlign: 'center' }} />
                </div>
              </div>
              <div className="gap-cell">
                <div className="gap-l">↓ Avance sur suivant <span style={{ color: 'var(--muted)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>· min:sec</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="number" min="0" max="59" className="mono"
                    value={ranking.gapNextMin || 0}
                    onChange={(e) => setRanking((r) => ({ ...r, gapNextMin: Math.max(0, +e.target.value || 0) }))}
                    style={{ width: 56, textAlign: 'center' }} />
                  <span style={{ color: 'var(--muted)' }}>:</span>
                  <input type="number" min="0" max="59" className="mono"
                    value={ranking.gapNextSec || 0}
                    onChange={(e) => setRanking((r) => ({ ...r, gapNextSec: Math.min(59, Math.max(0, +e.target.value || 0)) }))}
                    style={{ width: 56, textAlign: 'center' }} />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn primary" disabled={!raceStarted}
                onClick={() => {
                  const ts = Date.now()
                  const gp = (ranking.gapPrevMin || 0) || (ranking.gapPrevSec || 0)
                    ? `−${ranking.gapPrevMin || 0}:${String(ranking.gapPrevSec || 0).padStart(2, '0')}`
                    : null
                  const gn = (ranking.gapNextMin || 0) || (ranking.gapNextSec || 0)
                    ? `+${ranking.gapNextMin || 0}:${String(ranking.gapNextSec || 0).padStart(2, '0')}`
                    : null
                  const newLap: Lap = {
                    id: 'lp' + ts,
                    runnerId: '',
                    timestamp: ts,
                    lapTime: 0,
                    type: 'position',
                    position: ranking.position,
                    gapPrev: gp,
                    gapNext: gn,
                    lapNumber: null,
                  }
                  onAddPosition && onAddPosition(newLap)
                  setRanking((r) => ({
                    ...r,
                    history: [...(r.history || []), { t: ts, pos: ranking.position }],
                    gapPrevMin: 0, gapPrevSec: 0, gapNextMin: 0, gapNextSec: 0,
                  }))
                }}>
                🔖 Enregistrer la position
              </button>
              <span className="hint" style={{ marginLeft: 'auto' }}>
                Les pickers se remettent à zéro après chaque enregistrement
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Position evolution chart — simple inline SVG (legacy used Recharts) */}
      {ranking && (
        <div className="card">
          <div className="card-head">
            <span>📈</span>
            <h3>Évolution de la position</h3>
            <span className="badge accent" style={{ marginLeft: 'auto' }}>
              {ranking.position}<sup style={{ fontSize: 9 }}>e</sup>
            </span>
          </div>
          <div className="card-body">
            {chartData.length < 2 ? (
              <div className="empty">Saisissez la position au fil de la course pour voir l'évolution apparaître ici.</div>
            ) : (
              <PositionChart data={chartData} />
            )}
          </div>
        </div>
      )}

      {/* Position history list */}
      {positionHistory.length > 0 && setRanking && (
        <div className="card">
          <div className="card-head">
            <span>🏁</span>
            <h3>Historique des positions · {positionHistory.length}</h3>
          </div>
          <div className="card-body">
            <div className="grid" style={{ gap: 4 }}>
              {positionHistory.map((p, i) => {
                const fmtT = raceStartTime ? fmtClock(Math.max(0, p.t - raceStartTime)) : '—'
                return (
                  <div
                    key={p.t + '_' + i}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '60px 1fr auto 28px',
                      gap: 8,
                      alignItems: 'center',
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: 'oklch(0.65 0.18 270 / 0.08)',
                      border: '1px dashed oklch(0.65 0.18 270 / 0.4)',
                      fontSize: 13,
                    }}
                  >
                    <span className="badge accent" style={{ width: 'fit-content' }}>
                      {p.pos}<sup style={{ fontSize: 8 }}>{p.pos === 1 ? 'er' : 'e'}</sup>
                    </span>
                    <span style={{ color: 'var(--text-2)' }}>Position relevée</span>
                    <span className="mono" style={{ color: 'var(--muted)', fontSize: 12 }}>T+{fmtT}</span>
                    <button
                      className="btn ghost icon"
                      style={{ padding: 4 }}
                      onClick={() => setRanking((r) => ({ ...r, history: (r.history || []).filter((h) => h.t !== p.t) }))}
                      title="Supprimer"
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-head" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span>📊</span>
          <h3>Statistiques</h3>
          <select
            className="filter-select"
            value={filterRunnerId ?? ''}
            onChange={(e) => setFilterRunnerId(e.target.value || null)}
            title="Filtrer par coureur (s'applique à l'historique)"
            style={{
              marginLeft: 'auto',
              padding: '4px 8px',
              fontSize: 13,
              background: 'var(--bg-2)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 6,
            }}
          >
            <option value="">Tous les coureurs</option>
            {runners.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          {filterRunnerId && (
            <button
              className="btn ghost"
              style={{ fontSize: 12, padding: '3px 8px' }}
              onClick={() => setFilterRunnerId(null)}
              title="Réinitialiser le filtre"
            >
              ✕
            </button>
          )}
        </div>
        <div className="card-body">
          <div className="stat-row">
            <div className="stat">
              <div className="stat-label">Tours validés</div>
              <div className="stat-value mono">{totalLaps}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Manuels / Auto</div>
              <div className="stat-value mono">{manualCount} / {autoCount}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Relais</div>
              <div className="stat-value mono">{relayCount}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Moy. tour</div>
              <div className="stat-value mono">{avgMs ? fmtLap(avgMs) : '—'}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Meilleur tour</div>
              <div className="stat-value mono" style={{ color: 'var(--accent)' }}>
                {bestLap ? fmtLap(bestLap.lapTime) : '—'}
              </div>
              {bestLap && <div className="hint">{getRunner(bestLap.runnerId)?.name || '—'}</div>}
            </div>
            <div className="stat">
              <div className="stat-label" title={`Cumul équipe vs prévisionnel (allure cible + ${relayTransitionSec}s/relai)`}>
                Avance / Retard
              </div>
              <div className="stat-value mono" style={{ color: teamDeltaColor }}>
                {teamDelta.lapsCounted === 0 ? '—' : formatSignedDuration(teamDelta.deltaMs)}
              </div>
              {teamDelta.lastLapDeltaMs != null && (
                <div className="hint" style={{ color: lastDeltaColor }}>
                  Dernier {formatSignedDuration(teamDelta.lastLapDeltaMs)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span>📜</span>
          <h3>Historique{filterRunnerId ? ` · ${runners.find((r) => r.id === filterRunnerId)?.name || '—'}` : ''}</h3>
        </div>
        <div className="card-body">
          {sortedLaps.length === 0 ? (
            <div className="empty">
              {filterRunnerId
                ? `Aucun tour enregistré pour ${runners.find((r) => r.id === filterRunnerId)?.name || 'ce coureur'}.`
                : "Aucun tour pour l'instant. Le premier passage apparaîtra ici."}
            </div>
          ) : (
            <div className="laps">
              {sortedLaps.slice(0, pageLimit).map((l) => {
                const isPosition = l.type === 'position'
                if (isPosition) {
                  const fmtT = raceStartTime ? fmtClock(Math.max(0, l.timestamp - raceStartTime)) : '—'
                  return (
                    <div
                      key={l._id || l.id}
                      className="lap is-position"
                      style={{ background: 'oklch(0.65 0.18 270 / 0.08)', border: '1px dashed oklch(0.65 0.18 270 / 0.4)' }}
                    >
                      <span className="num">🏆</span>
                      <span className="who">
                        <span className="badge accent" style={{ marginRight: 8 }}>
                          {l.position}<sup style={{ fontSize: 8 }}>{l.position === 1 ? 'er' : 'e'}</sup>
                        </span>
                        <span style={{ color: 'var(--text-2)', fontSize: 13 }}>Position relevée</span>
                        {l.gapPrev && <span className="chip" style={{ marginLeft: 8, padding: '1px 6px', fontSize: 10, background: 'var(--bg-2)' }}>↑ {l.gapPrev}</span>}
                        {l.gapNext && <span className="chip" style={{ marginLeft: 4, padding: '1px 6px', fontSize: 10, background: 'var(--bg-2)' }}>↓ {l.gapNext}</span>}
                      </span>
                      <span className="time mono" style={{ color: 'var(--muted)', fontSize: 12 }}>T+{fmtT}</span>
                      <span className="pace" />
                      {onDeleteLap && (
                        <button className="btn ghost icon" style={{ padding: 4 }} onClick={() => onDeleteLap(l._id || l.id)} title="Supprimer">
                          ✕
                        </button>
                      )}
                    </div>
                  )
                }
                const r = getRunner(l.runnerId)
                const expectedMs = r ? kmPaceToLapMs(r.kmMin, r.kmSec) : 0
                const isAbnormal = expectedMs > 0 && l.lapTime > expectedMs * 2
                const badge = TYPE_BADGE[l.type] || TYPE_BADGE.checkpoint_manual
                const plusMinus = lapBadge[l._id || l.id]
                // Per-row delta — affiché uniquement pour tours manuels (auto = expected, delta=0 inutile)
                const isManual = l.type === 'checkpoint_manual' || l.type === 'relay_manual'
                const lapExpected = computeLapExpectedMs(l as any, r as any, relayTransitionSec)
                const lapDelta = isManual && lapExpected ? l.lapTime - lapExpected : null
                const lapDeltaTone = lapDelta != null ? getDeltaTone(lapDelta) : 'neutral'
                const lapDeltaColor = deltaToneColor(lapDeltaTone)
                return (
                  <div
                    key={l._id || l.id}
                    className={`lap is-${l.type}`}
                    style={isAbnormal ? { borderColor: 'oklch(0.72 0.21 25 / 0.4)', background: 'oklch(0.72 0.21 25 / 0.06)' } : undefined}
                  >
                    <span className="num">{l.lapNumber != null ? String(l.lapNumber).padStart(3, '0') : '—'}</span>
                    <span className="who">
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 999, background: r?.color, marginRight: 8, verticalAlign: 'middle' }} />
                      {r?.name || '—'}
                      <span
                        className="chip"
                        style={{ marginLeft: 8, padding: '1px 6px', fontSize: 10, background: badge.bg, color: badge.color }}
                      >
                        {badge.label}
                      </span>
                      {l.source === 'chronoplace' && (
                        <span
                          className="chip mono"
                          style={{
                            marginLeft: 6,
                            padding: '1px 6px',
                            fontSize: 10,
                            background: 'oklch(0.72 0.18 200 / 0.18)',
                            color: 'oklch(0.86 0.16 200)',
                            border: '1px solid oklch(0.72 0.18 200 / 0.5)',
                            cursor: l.chronoplaceId ? 'pointer' : 'default',
                          }}
                          title={l.chronoplaceId ? `Chronoplace id ${l.chronoplaceId} — cliquer pour voir le JSON` : 'Source Chronoplace'}
                          onClick={() => {
                            if (!l.chronoplaceId) return
                            window.open(
                              `https://www.chronoplace.fr/api/classement_live_endurance-detail/225/${(l as any).chronoplaceSlug ?? ''}`,
                              '_blank',
                              'noopener',
                            )
                          }}
                        >
                          🔄 chrono{l.chronoplaceId ? ` #${l.chronoplaceId}` : ''}
                        </span>
                      )}
                      {l.correctedByChronoplace && (
                        <span
                          className="chip"
                          style={{
                            marginLeft: 6,
                            padding: '1px 6px',
                            fontSize: 10,
                            background: 'oklch(0.86 0.20 135 / 0.18)',
                            color: 'oklch(0.92 0.20 135)',
                            border: '1px solid oklch(0.86 0.20 135 / 0.5)',
                          }}
                          title="Tour manuel corrigé / écrasé par Chronoplace"
                        >
                          ✓ corrigé
                        </span>
                      )}
                      {plusMinus && (
                        <span
                          className="chip mono"
                          style={{
                            marginLeft: 6,
                            padding: '1px 6px',
                            fontSize: 10,
                            background: plusMinus === 'plus'
                              ? 'oklch(0.78 0.18 80 / 0.18)'
                              : 'oklch(0.65 0.18 270 / 0.18)',
                            color: plusMinus === 'plus'
                              ? 'oklch(0.92 0.16 80)'
                              : 'oklch(0.78 0.18 270)',
                          }}
                          title={plusMinus === 'plus'
                            ? 'Tour supplémentaire (relai prévu plus tôt)'
                            : 'Relai pris avant le nombre de tours prévu'}
                        >
                          {plusMinus === 'plus' ? 'tour +' : 'tour −'}
                        </span>
                      )}
                      {(l as any).approximate && (
                        <span className="chip status-out" style={{ marginLeft: 8, padding: '1px 6px', fontSize: 10 }}>≈ approx.</span>
                      )}
                    </span>
                    <span
                      className="lap-times"
                      data-cycle={mobileCycle}
                      onClick={cycleNext}
                      title="Cliquer pour basculer (mobile)"
                      style={{ display: 'flex', gap: 12, alignItems: 'baseline', cursor: 'pointer' }}
                    >
                      <span className="lap-val-time time mono" data-kind="time">{fmtLap(l.lapTime)}</span>
                      <span className="lap-val-pace pace mono" data-kind="pace">{fmtPace(l.lapTime, lapDistanceM)}</span>
                      <span className="lap-val-paris mono" data-kind="paris" style={{ fontSize: 12, color: 'var(--text-2)' }}>🕒 {fmtParisHMS(l.timestamp)}</span>
                      <span className="lap-val-race mono" data-kind="race" style={{ fontSize: 12, color: 'var(--muted)' }}>T+{fmtRaceTime(l.timestamp)}</span>
                      {lapDelta != null ? (
                        <span
                          className="mono"
                          style={{
                            fontSize: 12,
                            color: lapDeltaColor,
                            fontWeight: 600,
                            minWidth: 56,
                            textAlign: 'right',
                          }}
                          title={`Cible : ${fmtLap(lapExpected!)} · Réel : ${fmtLap(l.lapTime)}`}
                        >
                          {formatSignedDuration(lapDelta)}
                        </span>
                      ) : (
                        !isManual && (
                          <span
                            className="mono"
                            style={{ fontSize: 12, color: 'var(--muted)', opacity: 0.4, minWidth: 56, textAlign: 'right' }}
                            title="Tour auto — pas de delta calculé"
                          >
                            —
                          </span>
                        )
                      )}
                    </span>
                    <div style={{ position: 'relative' }}>
                      {(onDeleteLap || onUpdateLap) && (
                        <button
                          className="btn ghost icon"
                          style={{ padding: 4 }}
                          onClick={() => setMenuOpenId(menuOpenId === (l._id || l.id) ? null : (l._id || l.id))}
                          title="Actions"
                        >
                          ⋯
                        </button>
                      )}
                      {menuOpenId === (l._id || l.id) && (
                        <>
                          <div
                            style={{ position: 'fixed', inset: 0, zIndex: 50 }}
                            onClick={() => setMenuOpenId(null)}
                          />
                          <div
                            style={{
                              position: 'absolute',
                              right: 0,
                              top: '100%',
                              zIndex: 60,
                              minWidth: 180,
                              background: 'var(--surface)',
                              border: '1px solid var(--border)',
                              borderRadius: 8,
                              padding: 4,
                              boxShadow: '0 14px 30px -10px rgba(0,0,0,0.5)',
                              display: 'grid',
                              gap: 2,
                            }}
                          >
                            {onUpdateLap && (
                              <button
                                className="btn ghost"
                                style={{ justifyContent: 'flex-start', fontSize: 13 }}
                                onClick={() => { setMenuOpenId(null); setFormMode({ kind: 'edit', lap: l }) }}
                              >
                                ✎ Modifier coureur
                              </button>
                            )}
                            {onDeleteLap && (
                              <button
                                className="btn ghost"
                                style={{ justifyContent: 'flex-start', fontSize: 13, color: 'oklch(0.85 0.16 25)' }}
                                onClick={() => {
                                  setMenuOpenId(null)
                                  if (window.confirm(`Supprimer le tour n°${l.lapNumber} ?`)) onDeleteLap(l._id || l.id)
                                }}
                              >
                                🗑 Supprimer
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {sortedLaps.length > pageLimit && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
              <button className="btn ghost" onClick={() => setPageLimit((n) => n + LAP_PAGE_STEP)}>
                ▼ Charger {Math.min(LAP_PAGE_STEP, sortedLaps.length - pageLimit)} tours de plus
                <span className="hint" style={{ marginLeft: 6 }}>({pageLimit} / {sortedLaps.length})</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Edit runner — single-field modal */}
      {formMode && formMode.kind === 'edit' && onUpdateLap && (
        <RunnerEditModal
          lap={formMode.lap}
          runners={runners}
          onClose={() => setFormMode(null)}
          onSubmit={(newRunnerId) => {
            onUpdateLap(formMode.lap._id || formMode.lap.id, {
              runnerId: newRunnerId,
              timestamp: formMode.lap.timestamp,
            })
            setFormMode(null)
          }}
        />
      )}
    </div>
  )
}

// Minimal modal to change ONLY the runner of an existing lap.
function RunnerEditModal({
  lap,
  runners,
  onClose,
  onSubmit,
}: {
  lap: Lap
  runners: Runner[]
  onClose: () => void
  onSubmit: (runnerId: string) => void
}) {
  const [runnerId, setRunnerId] = useState(lap.runnerId)
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Modifier le coureur — tour n°{lap.lapNumber ?? '—'}</h3>
          <button className="btn ghost icon" style={{ marginLeft: 'auto' }} onClick={onClose}>✕</button>
        </div>
        <div className="modal-body grid" style={{ gap: 14 }}>
          <div className="hint">
            Seul le coureur attribué à ce tour est modifiable. Heure, allure et type restent inchangés.
          </div>
          <div className="field">
            <span className="field-label">Coureur</span>
            <select value={runnerId} onChange={(e) => setRunnerId(e.target.value)}>
              {runners.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>Annuler</button>
          <button
            className="btn primary"
            disabled={!runnerId || runnerId === lap.runnerId}
            onClick={() => onSubmit(runnerId)}
          >
            ✓ Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}


// Simple inline SVG line chart for position evolution (stepAfter, reversed Y)
function PositionChart({ data }: { data: Array<{ t: number; pos: number }> }) {
  const W = 700, H = 200, PAD_L = 32, PAD_R = 16, PAD_T = 12, PAD_B = 22
  if (data.length < 2) return null
  const tMin = data[0].t
  const tMax = data[data.length - 1].t
  const tRange = Math.max(1, tMax - tMin)
  const posMin = 1
  const posMax = Math.max(...data.map((p) => p.pos), 2)
  const posRange = Math.max(1, posMax - posMin)
  const xFor = (t: number) => PAD_L + ((t - tMin) / tRange) * (W - PAD_L - PAD_R)
  const yFor = (pos: number) => PAD_T + ((pos - posMin) / posRange) * (H - PAD_T - PAD_B)
  // Step-after path
  let d = `M ${xFor(data[0].t)} ${yFor(data[0].pos)}`
  for (let i = 1; i < data.length; i++) {
    const prev = data[i - 1]
    const cur = data[i]
    d += ` L ${xFor(cur.t)} ${yFor(prev.pos)}`
    d += ` L ${xFor(cur.t)} ${yFor(cur.pos)}`
  }
  // Y-axis ticks (positions 1..posMax)
  const yTicks: number[] = []
  for (let p = posMin; p <= posMax; p++) yTicks.push(p)
  // X-axis ticks (4 evenly spaced)
  const xTicks: number[] = []
  for (let i = 0; i <= 4; i++) xTicks.push(tMin + (tRange * i) / 4)
  return (
    <div className="chart-wrap" style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 200, display: 'block' }}>
        {/* Grid */}
        {yTicks.map((p) => (
          <g key={'y' + p}>
            <line x1={PAD_L} y1={yFor(p)} x2={W - PAD_R} y2={yFor(p)} stroke="var(--border)" strokeDasharray="3 3" />
            <text x={PAD_L - 6} y={yFor(p) + 4} fill="var(--muted)" fontSize="10" textAnchor="end">{p}e</text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text key={'x' + i} x={xFor(t)} y={H - 6} fill="var(--muted)" fontSize="10" textAnchor="middle">
            {Math.round(t)}min
          </text>
        ))}
        {/* Path */}
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" />
        {/* Dots */}
        {data.map((p, i) => (
          <circle key={i} cx={xFor(p.t)} cy={yFor(p.pos)} r="3.5" fill="var(--accent)" stroke="var(--bg)" strokeWidth="2" />
        ))}
      </svg>
    </div>
  )
}
