import React, { useMemo, useRef, useState, useEffect } from 'react'
import {
  fmtClock,
  fmtKmPace,
  fmtLap,
  fmtPace,
  getRunnerPace,
  isAutoType,
  isRelayType,
  kmPaceToLapMs,
  lapMsToKmPace,
  LAP_DISTANCE_M,
  nextActiveIdx,
} from '../lib/race-data'
import { Avatar } from './Avatar'
import { EnergyBar } from './EnergyBar'
import { EnergySegment } from './EnergySegment'
import { GpxMap } from './GpxMap'
import { Modal } from './Modal'
import { StatusChip } from './StatusChip'
import { StatusSegment } from './StatusSegment'

interface Runner {
  id: string
  name: string
  kmMin: number
  kmSec: number
  color: string
  energy: number
  status: string
  plannedLaps: number
  liveKmMin?: number | null
  liveKmSec?: number | null
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
}

interface Race {
  started: boolean
  startTime: number | null
  laps: Lap[]
  currentIdx: number
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

interface LiveScreenProps {
  runners: Runner[]
  setRunners?: React.Dispatch<React.SetStateAction<Runner[]>>
  order: string[]
  setOrder?: React.Dispatch<React.SetStateAction<string[]>>
  race: Race
  setRace: React.Dispatch<React.SetStateAction<Race>>
  ranking?: Ranking
  setRanking?: React.Dispatch<React.SetStateAction<Ranking>>
  onBack: () => void
  team?: { name?: string; color?: string; ready?: boolean }
  setTeamReady?: (ready: boolean) => void
  pushToast?: (text: string, icon?: string) => void
}

export function LiveScreen({
  runners,
  setRunners,
  order,
  setOrder,
  race,
  setRace,
  ranking,
  setRanking,
  onBack,
  team: _team,
  setTeamReady: _setTeamReady,
  pushToast,
}: LiveScreenProps) {
  const [now, setNow] = useState(Date.now())
  const lastRecordAtRef = useRef(0)
  const MIN_LAP_GAP_MS = 5000
  const [pickerOpen, setPickerOpen] = useState<null | 'current' | 'reorder' | 'manage'>(null)
  const [editLapId, setEditLapId] = useState<string | null>(null)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])

  const RACE_DURATION_MS = 24 * 3600 * 1000
  const elapsed = race.started && race.startTime ? Math.min(now - race.startTime, RACE_DURATION_MS) : 0
  const progress = race.started ? Math.min(1, elapsed / RACE_DURATION_MS) : 0

  function getRunner(id: string) { return runners.find(r => r.id === id) }

  const currentRunnerId = order[race.currentIdx % Math.max(1, order.length)]
  const currentRunner = getRunner(currentRunnerId)
  const nIdx = nextActiveIdx(order, runners, race.currentIdx)
  const nextRunner = getRunner(order[nIdx])

  const lastLapAt = race.laps.length ? race.laps[race.laps.length - 1].timestamp : (race.startTime || 0)
  const currentLapMs = race.started ? now - lastLapAt : 0

  const realLaps = race.laps.filter(l => l.type !== 'position')
  const totalLaps = realLaps.length
  const totalDistanceM = totalLaps * LAP_DISTANCE_M
  const realAvgMs = totalLaps ? realLaps.reduce((a, l) => a + l.lapTime, 0) / totalLaps : 0
  const projectedLaps = realAvgMs ? Math.floor(RACE_DURATION_MS / realAvgMs) : 0
  const bestLap = realLaps.length ? realLaps.reduce((m, l) => (l.lapTime < m.lapTime ? l : m)) : null

  const lapsByRunner = useMemo(() => {
    const m: Record<string, number> = {}
    for (const l of realLaps) m[l.runnerId] = (m[l.runnerId] || 0) + 1
    return m
  }, [race.laps])

  const relayStats = useMemo(() => {
    let manualLastTs = race.startTime || 0
    for (let i = realLaps.length - 1; i >= 0; i--) {
      const l = realLaps[i]
      if (isRelayType(l.type) || l.type === 'top' || l.type === 'checkpoint_manual') {
        manualLastTs = l.timestamp
        break
      }
    }
    let lapsThisRelay = 0
    if (currentRunnerId) {
      for (let i = realLaps.length - 1; i >= 0; i--) {
        const l = realLaps[i]
        if (isRelayType(l.type)) break
        if (l.runnerId === currentRunnerId) lapsThisRelay++
      }
    }
    return { manualLastTs, lapsThisRelay }
  }, [race.laps, currentRunnerId, race.startTime])

  function recordLap(change: boolean) {
    const ts = Date.now()
    if (ts - lastRecordAtRef.current < MIN_LAP_GAP_MS) {
      pushToast && pushToast(`Trop rapide — attends ${Math.ceil((MIN_LAP_GAP_MS - (ts - lastRecordAtRef.current)) / 1000)}s`, 'AlertTriangle')
      return
    }
    const lastInState = realLaps[realLaps.length - 1]
    if (lastInState && ts - lastInState.timestamp < MIN_LAP_GAP_MS) {
      pushToast && pushToast(`Trop rapide — attends ${Math.ceil((MIN_LAP_GAP_MS - (ts - lastInState.timestamp)) / 1000)}s`, 'AlertTriangle')
      return
    }
    lastRecordAtRef.current = ts
    const nIdxLocal = change ? nextActiveIdx(order, runners, race.currentIdx) : race.currentIdx
    const refTs = lastInState ? lastInState.timestamp : (race.startTime || 0)
    const lapTime = ts - (refTs || 0)
    const newLap: Lap = {
      id: 'l' + ts,
      runnerId: currentRunnerId,
      timestamp: ts,
      lapTime,
      type: change ? 'relay_manual' : 'checkpoint_manual',
      lapNumber: realLaps.length + 1,
    }
    setRace((r) => ({ ...r, laps: [...r.laps, newLap], currentIdx: nIdxLocal }))
    pushToast && pushToast(change ? `Relais → ${getRunner(order[nIdxLocal])?.name}` : `Top — ${fmtLap(lapTime)}`, change ? 'Repeat' : 'Flag')

    // Auto-calibrate: lap time becomes the runner's live pace ONLY if reasonable.
    // Skip if abnormal (e.g. "démarrage tardif" where lapTime spans hours from race start).
    if (setRunners && currentRunner) {
      const expectedMs = kmPaceToLapMs(currentRunner.kmMin, currentRunner.kmSec)
      const isReasonable = expectedMs > 0 && lapTime > 0 && lapTime <= expectedMs * 1.5
      if (isReasonable) {
        const km = lapMsToKmPace(lapTime)
        setRunners((rs) => rs.map((rr) => (rr.id === currentRunnerId ? { ...rr, liveKmMin: km.min, liveKmSec: km.sec } : rr)))
      }
    }
  }

  function undoLap() {
    if (!race.laps.length) return
    setRace((r) => {
      const last = r.laps[r.laps.length - 1]
      return {
        ...r,
        laps: r.laps.slice(0, -1),
        currentIdx: isRelayType(last.type)
          ? (r.currentIdx - 1 + order.length) % Math.max(1, order.length)
          : r.currentIdx,
      }
    })
    pushToast && pushToast('Dernière action annulée', 'Undo2')
  }

  function deleteLap(lapId: string) {
    setRace((r) => ({ ...r, laps: r.laps.filter((l) => (l._id || l.id) !== lapId) }))
  }

  function changeLapRunner(lapId: string, newRunnerId: string) {
    const lap = race.laps.find((l) => (l._id || l.id) === lapId)
    if (!lap) return
    const newRunner = runners.find((r) => r.id === newRunnerId)
    if (!newRunner) return
    const oldRunner = runners.find((r) => r.id === lap.runnerId)
    if (!window.confirm(`Réattribuer ce tour de "${oldRunner?.name || '?'}" à "${newRunner.name}" ?`)) return
    setRace((r) => ({ ...r, laps: r.laps.map((l) => ((l._id || l.id) === lapId ? { ...l, runnerId: newRunnerId } : l)) }))
    setEditLapId(null)
    pushToast && pushToast('Coureur du tour modifié', 'UserCheck')
  }

  function setCurrentTo(runnerId: string) {
    const idx = order.indexOf(runnerId)
    if (idx >= 0) {
      setRace((r) => ({ ...r, currentIdx: idx }))
      pushToast && pushToast(`Coureur courant → ${getRunner(runnerId)?.name}`, 'UserCheck')
    }
    setPickerOpen(null)
  }

  const expectedLapMs = currentRunner ? kmPaceToLapMs(getRunnerPace(currentRunner, race).kmMin, getRunnerPace(currentRunner, race).kmSec) : 0

  // Calibration window — allow recording only inside 40-60% of cycle around estimated time
  const timeSinceManual = race.started && relayStats.manualLastTs ? Math.max(0, now - relayStats.manualLastTs) : 0
  const inCalibWindow = (() => {
    if (!race.started || expectedLapMs <= 0) return false
    const cycleIdx = Math.floor(timeSinceManual / expectedLapMs)
    const cycleStart = cycleIdx * expectedLapMs
    const tIn = timeSinceManual - cycleStart
    return tIn >= 0.4 * expectedLapMs || tIn <= 0.6 * expectedLapMs
  })()
  const remainingToPassage = expectedLapMs > 0 ? expectedLapMs - currentLapMs : 0
  const plannedLaps = Math.max(1, currentRunner?.plannedLaps || 1)
  const lapsRemainingInRelay = Math.max(0, plannedLaps - relayStats.lapsThisRelay)
  // Fractional progress within current lap (0..1)
  const currentLapProgress = expectedLapMs > 0 ? Math.min(1, currentLapMs / expectedLapMs) : 0
  // Fractional remaining laps until relay (e.g. 1.3 = 1 full lap + 0.3 left of current)
  const fractionalRemaining = Math.max(0, lapsRemainingInRelay - currentLapProgress)
  // "Tour en cours" — 1-based index of in-progress lap, capped at planned
  const currentLapIndex = Math.min(plannedLaps, relayStats.lapsThisRelay + (lapsRemainingInRelay > 0 ? 1 : 0))
  const etaRelay = lapsRemainingInRelay > 0 ? Math.max(0, lapsRemainingInRelay * expectedLapMs - currentLapMs) : 0

  return (
    <div className="page">
      <div className="grid live-grid">
        {/* Left column — hero */}
        <div className="grid" style={{ gap: 18, alignContent: 'start' }}>
          <div className="hero-card">
            <div className="progress-track"><div className="progress-fill" style={{ width: `${progress * 100}%` }} /></div>
            <div style={{ display: 'flex', gap: 18, marginTop: 14, flexWrap: 'wrap', color: 'var(--muted)', fontSize: 13 }}>
              <span>📍 {(totalDistanceM / 1000).toFixed(2)} km parcourus</span>
              <span>🏁 {totalLaps} tours</span>
              {realAvgMs > 0 && <span>⚡ Moy. {fmtLap(realAvgMs)}</span>}
              {projectedLaps > 0 && <span>🎯 Proj. {projectedLaps} t</span>}
            </div>

            {/* Current runner band */}
            {currentRunner && (
              <div className="runner-current">
                <Avatar name={currentRunner.name} color={currentRunner.color} size={56} />
                <div className="runner-meta">
                  <div className="role">Coureur en piste · {String(race.currentIdx + 1).padStart(2, '0')} / {order.length}</div>
                  <div className="name">{currentRunner.name}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                    <StatusChip value={currentRunner.status} />
                    <EnergyBar value={currentRunner.energy} />
                    {(() => {
                      const p = getRunnerPace(currentRunner, race)
                      return (
                        <span className="hint">
                          Tour <span className="mono" style={{ color: 'var(--accent)', fontWeight: 600 }}>{race.started ? fmtLap(currentLapMs) : '—'}</span>
                          {' · '}Allure {p.source === 'override' ? 'man.' : p.source === 'live' ? 'live' : `estim. (E${currentRunner.energy}%)`}{' '}
                          <span className="mono">{fmtKmPace(p.kmMin, p.kmSec)}</span>
                          {' · '}Relai <span className="mono" style={{ color: 'var(--accent)', fontWeight: 600 }}>{currentLapIndex}</span>
                          /<span className="mono">{plannedLaps}</span> tours
                        </span>
                      )
                    })()}
                  </div>
                </div>
                <div className="runner-pace">
                  <div className="v">{fmtKmPace(currentRunner.kmMin, currentRunner.kmSec)}</div>
                  <div className="l">Cible / km</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
                    {setRunners && (
                      <button className="btn ghost" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => setPickerOpen('manage')}>
                        ⚙️ Gérer
                      </button>
                    )}
                    <button className="btn ghost" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => setPickerOpen('current')}>
                      🔁 Changer
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Relay panel */}
            {currentRunner && (() => {
              const relayLapsRev = []
              for (let i = realLaps.length - 1; i >= 0; i--) {
                if (isRelayType(realLaps[i].type)) break
                if (realLaps[i].runnerId === currentRunnerId) relayLapsRev.push(realLaps[i])
              }
              const relayLaps = relayLapsRev.reverse()
              const lastLap = relayLaps[relayLaps.length - 1]
              const avgMs = relayLaps.length ? relayLaps.reduce((a, l) => a + l.lapTime, 0) / relayLaps.length : 0
              return (
                <div className="relay-panel">
                  <div className="relay-head">
                    <span className="relay-title">🔁 Relais en cours</span>
                    <span className="relay-count"><span className="mono">{relayLaps.length}</span> tour{relayLaps.length > 1 ? 's' : ''}</span>
                  </div>
                  <div className="relay-stats">
                    <div className="rs">
                      <div className="rs-l">Dernier tour</div>
                      <div className="rs-v mono">{lastLap ? fmtLap(lastLap.lapTime) : '—'}</div>
                      <div className="rs-s mono">{lastLap ? fmtPace(lastLap.lapTime) : '—'}</div>
                    </div>
                    <div className="rs">
                      <div className="rs-l">Moy. tour</div>
                      <div className="rs-v mono">{avgMs ? fmtLap(avgMs) : '—'}</div>
                      <div className="rs-s mono">{avgMs ? fmtPace(avgMs) : '—'}</div>
                    </div>
                    <div className="rs">
                      <div className="rs-l">Allure /km moy.</div>
                      <div className="rs-v mono">{avgMs ? fmtPace(avgMs) : '—'}</div>
                      <div className="rs-s">sur ce relais</div>
                    </div>
                  </div>
                  {relayLaps.length > 0 && (
                    <div className="relay-laps">
                      {relayLaps.map((l, i) => {
                        const expectedMs = kmPaceToLapMs(currentRunner.kmMin, currentRunner.kmSec)
                        const abnormal = expectedMs > 0 && l.lapTime > expectedMs * 2
                        return (
                          <div key={l._id || l.id} className={`rl ${abnormal ? 'is-abn' : ''}`}>
                            <span className="rl-n mono">T{String(i + 1).padStart(2, '0')}</span>
                            <span className="rl-t mono">{fmtLap(l.lapTime)}</span>
                            <span className="rl-p mono">{fmtPace(l.lapTime)}</span>
                            {abnormal && <span className="rl-flag">⚠️</span>}
                            <button className="btn ghost icon" style={{ padding: 3 }} onClick={() => deleteLap(l._id || l.id)} title="Annuler ce tour">
                              ✕
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Controls */}
            <div className="controls">
              {race.started && realLaps.length === 0 ? (
                <button className="big-btn start" style={{ gridColumn: '1 / -1' }} onClick={() => recordLap(false)}>
                  <span className="label-top">Démarrage tardif de l'équipe</span>
                  <span className="label-main">Lancer l'équipe avec le passage de {currentRunner?.name || '—'}</span>
                  <span className="label-sub">Premier passage validé. Les boutons Top / Relais apparaissent ensuite.</span>
                </button>
              ) : (
                <>
                  <button
                    className={`big-btn top ${lapsRemainingInRelay === 0 ? 'is-relay-imminent' : ''}`}
                    disabled={!race.started || !inCalibWindow}
                    onClick={() => recordLap(false)}
                  >
                    <span className="label-top">Top passage</span>
                    <span className="label-main mono">
                      {!race.started ? '—' : remainingToPassage > 0 ? `dans ${fmtLap(remainingToPassage)}` : 'fin de passage'}
                    </span>
                    <span className="label-sub">
                      {!race.started
                        ? 'En attente du top départ'
                        : lapsRemainingInRelay === 0
                          ? `Dernier tour avant relai · ${currentRunner?.name}`
                          : `Tour validé · ${currentRunner?.name}. Calibre à la seconde près.`}
                    </span>
                  </button>
                  <button
                    className={`big-btn relay ${lapsRemainingInRelay > 0 && race.started ? 'is-warn' : ''}`}
                    disabled={!race.started || !inCalibWindow}
                    onClick={() => recordLap(true)}
                  >
                    <span className="label-top">Relai → {nextRunner?.name || '—'}</span>
                    <span className="label-main mono">
                      {!race.started ? '—' : etaRelay > 0 ? `dans ${fmtLap(etaRelay)}` : 'maintenant'}
                    </span>
                    <span className="label-sub">
                      {!race.started
                        ? 'En attente du top départ'
                        : (
                          <>
                            Reste <span className="mono" style={{ color: 'var(--accent)', fontWeight: 600 }}>{fractionalRemaining.toFixed(1).replace('.', ',')}</span> tour{fractionalRemaining >= 2 ? 's' : ''} pour {currentRunner?.name}.
                          </>
                        )}
                    </span>
                  </button>
                </>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn ghost" onClick={undoLap} disabled={!race.laps.length}>
                ↩ Annuler dernier
              </button>
              <button className="btn ghost" onClick={() => setPickerOpen('reorder')} disabled={!setOrder}>
                📋 Modifier l'ordre
              </button>
              <button className="btn ghost" style={{ marginLeft: 'auto' }} onClick={onBack}>
                ← Planning
              </button>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="grid" style={{ gap: 18, alignContent: 'start' }}>
          <div className="card">
            <div className="card-head">
              <span>🗺️</span>
              <h3>Circuit</h3>
              <span className="badge" style={{ marginLeft: 'auto' }}>{LAP_DISTANCE_M} m</span>
            </div>
            <div className="card-body" style={{ paddingTop: 10 }}>
              <div className="live-map">
                <GpxMap
                  showLabel={false}
                  progress={(() => {
                    if (!race.started || !currentRunner) return undefined
                    const p = getRunnerPace(currentRunner, race)
                    const expected = kmPaceToLapMs(p.kmMin, p.kmSec)
                    return expected > 0 ? currentLapMs / expected : undefined
                  })()}
                />
              </div>
              <div className="stat-row" style={{ marginTop: 12 }}>
                <div className="stat" style={{ minWidth: 0 }}>
                  <div className="stat-label">Meilleur tour</div>
                  <div className="stat-value mono" style={{ fontSize: 18, color: 'var(--accent)' }}>
                    {bestLap ? fmtLap(bestLap.lapTime) : '—'}
                  </div>
                  {bestLap && <div className="hint">{getRunner(bestLap.runnerId)?.name}</div>}
                </div>
                <div className="stat" style={{ minWidth: 0 }}>
                  <div className="stat-label">Allure équipe</div>
                  <div className="stat-value mono" style={{ fontSize: 18 }}>{realAvgMs ? fmtPace(realAvgMs) : '—'}</div>
                </div>
              </div>
            </div>
          </div>

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
                    <button className="pos-step" onClick={() => setRanking((r) => ({ ...r, position: Math.max(1, r.position - 1) }))}>
                      ▲
                    </button>
                    <button className="pos-step" onClick={() => setRanking((r) => ({ ...r, position: r.position + 1 }))}>
                      ▼
                    </button>
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
                  <button className="btn primary" disabled={!race.started}
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
                      setRace((r) => ({ ...r, laps: [...r.laps, newLap] }))
                      setRanking((r) => ({
                        ...r,
                        history: [...(r.history || []), { t: ts, pos: ranking.position }],
                        gapPrevMin: 0, gapPrevSec: 0, gapNextMin: 0, gapNextSec: 0,
                      }))
                      pushToast && pushToast(`Position ${ranking.position}e enregistrée`, 'BookmarkCheck')
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
        </div>
      </div>

      {/* Pickers / Modals */}
      {pickerOpen === 'current' && (
        <Modal title="Changer le coureur en piste" icon="🔁" onClose={() => setPickerOpen(null)}>
          <div className="hint" style={{ marginBottom: 10 }}>
            Sélectionnez le coureur actuellement en piste. L'ordre suivant sera repris à partir de lui.
          </div>
          <div className="grid" style={{ gap: 8 }}>
            {order.map((id, idx) => {
              const r = getRunner(id)
              if (!r) return null
              const isCurrent = idx === race.currentIdx
              return (
                <div key={id} className={`pick-row ${isCurrent ? 'is-current' : ''}`} onClick={() => setCurrentTo(id)}>
                  <span style={{ width: 14, height: 14, borderRadius: 4, background: r.color }} />
                  <div>
                    <div style={{ fontWeight: 500 }}>{r.name}</div>
                    <div className="hint">Position {idx + 1} · {fmtKmPace(r.kmMin, r.kmSec)} cible</div>
                  </div>
                  <span className="mono" style={{ color: 'var(--muted)' }}>{lapsByRunner[id] || 0} t</span>
                </div>
              )
            })}
          </div>
        </Modal>
      )}

      {pickerOpen === 'manage' && setRunners && (
        <ManageRunnersModal
          runners={runners}
          setRunners={setRunners}
          race={race}
          order={order}
          currentIdx={race.currentIdx}
          onClose={() => setPickerOpen(null)}
          pushToast={pushToast}
        />
      )}

      {editLapId && (() => {
        const lap = race.laps.find((l) => (l._id || l.id) === editLapId)
        if (!lap) return null
        const r0 = runners.find((r) => r.id === lap.runnerId)
        return (
          <Modal title={`Réattribuer le tour n°${lap.lapNumber}`} icon="👤" onClose={() => setEditLapId(null)}>
            <div className="hint" style={{ marginBottom: 10 }}>
              Choisis le coureur qui a réellement fait ce tour. Le temps de tour reste inchangé.
              {r0 && <> Actuellement attribué à <strong>{r0.name}</strong>.</>}
            </div>
            <div className="grid" style={{ gap: 8 }}>
              {runners.map((r) => {
                const isCurrent = r.id === lap.runnerId
                return (
                  <div key={r.id} className={`pick-row ${isCurrent ? 'is-current' : ''}`} style={{ cursor: 'pointer' }}
                    onClick={() => changeLapRunner(editLapId!, r.id)}>
                    <span style={{ width: 14, height: 14, borderRadius: 4, background: r.color }} />
                    <div>
                      <div style={{ fontWeight: 500 }}>{r.name}</div>
                      <div className="hint">{fmtKmPace(r.kmMin, r.kmSec)} cible {isCurrent ? '· actuel' : ''}</div>
                    </div>
                    <span className="mono" style={{ color: 'var(--muted)' }}>{lapsByRunner[r.id] || 0} t</span>
                  </div>
                )
              })}
            </div>
          </Modal>
        )
      })()}

      {pickerOpen === 'reorder' && setOrder && (
        <ReorderModal
          order={order}
          setOrder={setOrder}
          runners={runners}
          currentIdx={race.currentIdx}
          onClose={() => setPickerOpen(null)}
        />
      )}
    </div>
  )
}

// ───────────────────────── Reorder modal ──────────────────────────

function ReorderModal({
  order,
  setOrder,
  runners,
  currentIdx,
  onClose,
}: {
  order: string[]
  setOrder: React.Dispatch<React.SetStateAction<string[]>>
  runners: Runner[]
  currentIdx: number
  onClose: () => void
}) {
  const [draft, setDraft] = useState(order.slice())
  function getRunner(id: string) { return runners.find(r => r.id === id) }
  function move(i: number, dir: number) {
    if (i + dir <= currentIdx) return
    const j = i + dir
    if (j < 0 || j >= draft.length) return
    const c = draft.slice()
    ;[c[i], c[j]] = [c[j], c[i]]
    setDraft(c)
  }
  return (
    <Modal title="Modifier l'ordre des relais" icon="📋" onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={() => {
            if (!window.confirm("Modifier l'ordre des relais ?")) return
            setOrder(draft)
            onClose()
          }}>
            ✓ Appliquer
          </button>
        </>
      }>
      <div className="hint" style={{ marginBottom: 10 }}>
        Vous ne pouvez modifier que les relais à venir. La position actuelle est verrouillée.
      </div>
      <div className="grid" style={{ gap: 6 }}>
        {draft.map((id, idx) => {
          const r = getRunner(id)
          if (!r) return null
          const locked = idx <= currentIdx
          return (
            <div key={id} className="pick-row" style={{ opacity: locked ? 0.5 : 1 }}>
              <span style={{ width: 14, height: 14, borderRadius: 4, background: r.color }} />
              <div>
                <div style={{ fontWeight: 500 }}>
                  <span className="mono" style={{ color: 'var(--muted)', marginRight: 8 }}>{String(idx + 1).padStart(2, '0')}</span>
                  {r.name}
                  {idx === currentIdx && <span className="badge accent" style={{ marginLeft: 8 }}>en piste</span>}
                </div>
                <div className="hint">{fmtLap(kmPaceToLapMs(r.kmMin, r.kmSec))}</div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn ghost icon" onClick={() => move(idx, -1)} disabled={locked || idx <= currentIdx + 1}>▲</button>
                <button className="btn ghost icon" onClick={() => move(idx, 1)} disabled={locked || idx === draft.length - 1}>▼</button>
              </div>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}

// ───────────────────────── Manage runners modal ─────────────────────

function ManageRunnersModal({
  runners,
  setRunners,
  race,
  order,
  currentIdx,
  onClose,
  pushToast,
}: {
  runners: Runner[]
  setRunners: React.Dispatch<React.SetStateAction<Runner[]>>
  race: Race
  order: string[]
  currentIdx: number
  onClose: () => void
  pushToast?: (text: string, icon?: string) => void
}) {
  function update(id: string, patch: Partial<Runner>) {
    setRunners((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }
  function applyLiveAuto(id: string) {
    const r = runners.find((x) => x.id === id)
    if (!r) return
    const p = getRunnerPace(r, race)
    if (p.source === 'live') {
      update(id, { liveKmMin: p.kmMin, liveKmSec: p.kmSec })
      pushToast && pushToast(`${r.name} → allure verrouillée à ${fmtKmPace(p.kmMin, p.kmSec)}`, 'Lock')
    }
  }
  function clearOverride(id: string) {
    update(id, { liveKmMin: null, liveKmSec: null })
  }
  const lapsByRunner: Record<string, number> = {}
  for (const l of race.laps.filter((l) => l.type !== 'position')) {
    lapsByRunner[l.runnerId] = (lapsByRunner[l.runnerId] || 0) + 1
  }
  return (
    <Modal title="Gérer les coureurs" icon="⚙️" onClose={onClose}
      footer={<button className="btn primary" onClick={onClose}>Terminé</button>}>
      <div className="hint" style={{ marginBottom: 12 }}>
        Mettez à jour énergie, statut, et allure live en cours de course. L'allure auto = temps du dernier tour du coureur.
      </div>
      <div className="grid" style={{ gap: 10 }}>
        {order.map((id, idx) => {
          const r = runners.find((x) => x.id === id)
          if (!r) return null
          const p = getRunnerPace(r, race)
          const isCurrent = idx === currentIdx
          const hasOverride = r.liveKmMin != null && r.liveKmSec != null
          return (
            <div key={id} className="card" style={{ background: 'var(--bg-2)', borderColor: isCurrent ? 'var(--accent-line)' : 'var(--border)' }}>
              <div style={{ padding: 12, display: 'grid', gridTemplateColumns: '12px 1fr auto', gap: 10, alignItems: 'center' }}>
                <span style={{ width: 12, height: 12, borderRadius: 4, background: r.color }} />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong>{r.name}</strong>
                    {isCurrent && <span className="badge accent">en piste</span>}
                  </div>
                  <div className="hint">
                    {lapsByRunner[id] || 0} tour{(lapsByRunner[id] || 0) > 1 ? 's' : ''} effectué{(lapsByRunner[id] || 0) > 1 ? 's' : ''}
                    {p.actualLapMs && <> · live {fmtLap(p.actualLapMs)}</>}
                  </div>
                </div>
              </div>
              <div style={{ padding: '0 12px 12px', display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <div>
                    <div className="field-label" style={{ marginBottom: 4 }}>Énergie</div>
                    <EnergySegment value={r.energy} onChange={(v) => update(id, { energy: v })} />
                  </div>
                  <div>
                    <div className="field-label" style={{ marginBottom: 4 }}>Statut</div>
                    <StatusSegment value={r.status} onChange={(v) => update(id, { status: v })} />
                  </div>
                </div>
                <div className="pace-stack" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                  <div>
                    <div className="lab">Estim. (fix)</div>
                    <div className="val">{fmtKmPace(r.kmMin, r.kmSec)}</div>
                  </div>
                  <div>
                    <div className="lab">Auto (live)</div>
                    <div className="val live">{p.actualLapMs ? (() => { const k = lapMsToKmPace(p.actualLapMs); return fmtKmPace(k.min, k.sec) })() : '—'}</div>
                  </div>
                  <div>
                    <div className="lab">Override</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <span className="pace-mini-input">
                        <input type="number" min="0" max="20" value={r.liveKmMin ?? ''} placeholder={String(p.kmMin)}
                          onChange={(e) => update(id, { liveKmMin: e.target.value === '' ? null : Math.max(0, +e.target.value) })} />
                        <span>:</span>
                        <input type="number" min="0" max="59" value={r.liveKmSec ?? ''} placeholder={String(p.kmSec).padStart(2, '0')}
                          onChange={(e) => update(id, { liveKmSec: e.target.value === '' ? null : Math.min(59, Math.max(0, +e.target.value)) })} />
                      </span>
                      {hasOverride && (
                        <button className="btn ghost icon" onClick={() => clearOverride(id)} title="Retirer l'override">✕</button>
                      )}
                    </div>
                  </div>
                </div>
                {p.actualLapMs && !hasOverride && (
                  <button className="btn ghost" style={{ alignSelf: 'flex-start', padding: '4px 8px', fontSize: 12 }}
                    onClick={() => applyLiveAuto(id)}>
                    🔒 Verrouiller l'allure live comme override
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}

// quiet unused-helper warning
void fmtClock
void isAutoType
