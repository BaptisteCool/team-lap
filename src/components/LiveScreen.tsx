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
  group?: string
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
  team?: { name?: string; color?: string; ready?: boolean; autoPaused?: boolean; groupModeQueue?: Array<{ groupName: string; remainingRelays: number; status: 'active' | 'pending' }> }
  setTeamReady?: (ready: boolean) => void
  onRecordLap?: (change: boolean, runnerId: string) => Promise<{ docId?: any; lapId?: string } | unknown> | void
  onUndoLap?: (docId: string) => void
  onUndoLastLap?: () => void
  onUpdateLapTime?: (lapId: string, lapTimeMs: number) => void
  onSetCurrentIdx?: (idx: number) => void
  onSetAutoPaused?: (paused: boolean) => void
  replaceAutoWindowSec?: number
  minLapSec?: number
  maxLapSec?: number
  pushToast?: (text: string, icon?: string, action?: { label: string; fn: () => void }) => void
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
  team,
  setTeamReady: _setTeamReady,
  onRecordLap,
  onUndoLap,
  onUndoLastLap,
  onUpdateLapTime,
  onSetCurrentIdx,
  onSetAutoPaused,
  replaceAutoWindowSec,
  minLapSec = 165,
  maxLapSec = 480,
  pushToast,
}: LiveScreenProps) {
  const [nowReal, setNowReal] = useState(Date.now())
  const [pausedAtMs, setPausedAtMs] = useState<number | null>(null)
  const lastRecordAtRef = useRef(0)
  const [pickerOpen, setPickerOpen] = useState<null | 'current' | 'reorder' | 'manage'>(null)
  // Slide-to-unlock state: forces buttons enabled even outside the 45s window
  const [forceUnlock, setForceUnlock] = useState(false)
  const [slideVal, setSlideVal] = useState(0)
  const [editLapId, setEditLapId] = useState<string | null>(null)
  const [editTimeFor, setEditTimeFor] = useState<{ lapId: string; lapNumber: number } | null>(null)
  const [editMin, setEditMin] = useState(0)
  const [editSec, setEditSec] = useState(0)
  const [editPaceOpen, setEditPaceOpen] = useState(false)
  const [editPaceMin, setEditPaceMin] = useState(0)
  const [editPaceSec, setEditPaceSec] = useState(0)
  const [relayEditOpen, setRelayEditOpen] = useState(false)

  useEffect(() => {
    const id = setInterval(() => setNowReal(Date.now()), 250)
    return () => clearInterval(id)
  }, [])

  // Auto re-lock slider whenever a new lap is recorded (manual or auto) — buttons get blocked again
  useEffect(() => {
    setForceUnlock(false)
    setSlideVal(0)
  }, [race.laps.length])

  // Track when team enters auto-paused state to freeze time displays
  useEffect(() => {
    if (team?.autoPaused && pausedAtMs == null) setPausedAtMs(Date.now())
    if (!team?.autoPaused && pausedAtMs != null) setPausedAtMs(null)
  }, [team?.autoPaused, pausedAtMs])

  // "now" used for time computations: frozen at pausedAtMs while auto is paused
  const now = team?.autoPaused && pausedAtMs != null ? pausedAtMs : nowReal

  const RACE_DURATION_MS = 24 * 3600 * 1000
  const elapsed = race.started && race.startTime ? Math.min(now - race.startTime, RACE_DURATION_MS) : 0
  const progress = race.started ? Math.min(1, elapsed / RACE_DURATION_MS) : 0

  function getRunner(id: string) { return runners.find(r => r.id === id) }

  // DB-driven current runner (advances after manual / auto relay)
  const currentRunnerId = order[race.currentIdx % Math.max(1, order.length)]
  const currentRunner = getRunner(currentRunnerId)
  // Active group-mode entry — affects next runner computation if status='active'
  const activeGroupEntry = team?.groupModeQueue && team.groupModeQueue.length > 0
    ? team.groupModeQueue[0]
    : null
  const groupActive = activeGroupEntry?.status === 'active' ? activeGroupEntry : null
  // Compute next runner: if group active and there is at least one other group member non-out → restrict
  let nIdx = nextActiveIdx(order, runners, race.currentIdx)
  if (groupActive) {
    const groupMemberIdx = (() => {
      for (let i = 1; i <= order.length; i++) {
        const idx = (race.currentIdx + i) % order.length
        const r = runners.find((x) => x.id === order[idx])
        if (r && r.status !== 'out' && r.group === groupActive.groupName) return idx
      }
      return -1
    })()
    if (groupMemberIdx >= 0) nIdx = groupMemberIdx
  }
  const nextRunner = getRunner(order[nIdx])

  const realLaps = race.laps.filter(l => l.type !== 'position')
  const dbTotalLaps = realLaps.length
  const realAvgMs = dbTotalLaps ? realLaps.reduce((a, l) => a + l.lapTime, 0) / dbTotalLaps : 0
  const totalDistanceM = dbTotalLaps * LAP_DISTANCE_M
  const projTotalLaps = dbTotalLaps
  // While the last lap is AUTO and within the admin replace window, treat it as tentative —
  // buttons + display should keep the values they had BEFORE the auto fired, so a late runner
  // can still click manually and the displayed ETAs stay stable.
  function isAutoTypeStr(t: string) { return t === 'checkpoint_auto' || t === 'relay_auto' }
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
    if (ts - lastRecordAtRef.current < 1000) return // tiny client-side debounce only
    lastRecordAtRef.current = ts
    // Note: plannedLaps n'est plus bumpé — chaque lap conserve son `plannedAtStart` (snapshot serveur)
    // et les badges tour +/- sont dérivés de ce snapshot vs position dans le relai.
    // Server handles: replace recent auto lap if within configured window, bypass server debounce for manual.
    if (onRecordLap) {
      const promise = onRecordLap(change, currentRunnerId)
      // Compute delta vs estimation (effCurrentLapMs vs expectedLapMs from estim/live)
      let deltaMsg = ''
      if (expectedLapMs > 0 && effCurrentLapMs > 0) {
        const deltaMs = effCurrentLapMs - expectedLapMs
        const absSec = Math.abs(deltaMs) / 1000
        const sign = deltaMs < 0 ? 'avance' : 'retard'
        const fmtDelta = absSec >= 60
          ? `${Math.floor(absSec / 60)}:${String(Math.round(absSec % 60)).padStart(2, '0')}`
          : `${absSec.toFixed(1)}s`
        if (absSec >= 1) deltaMsg = ` · ${sign} ${fmtDelta}`
      }
      const baseMsg = change
        ? `Relais → ${nextRunner?.name || '—'}`
        : `Top — ${currentRunner?.name || '—'}`
      // Await server result to retrieve the inserted lap docId, then offer Annuler action.
      Promise.resolve(promise).then((res: any) => {
        const docId = res?.docId
        if (docId && pushToast && onUndoLap) {
          pushToast(baseMsg + deltaMsg, change ? 'Repeat' : 'Flag', {
            label: '↩ Annuler',
            fn: () => onUndoLap(docId),
          })
        } else if (pushToast) {
          pushToast(baseMsg + deltaMsg, change ? 'Repeat' : 'Flag')
        }
      }).catch(() => {
        pushToast && pushToast(baseMsg + deltaMsg, change ? 'Repeat' : 'Flag')
      })
    }
    // Reset force-unlock after a successful manual click
    setForceUnlock(false)
    setSlideVal(0)
    // Auto-calibration côté serveur uniquement (recordLap mutation) — évite race condition + lapTime erroné
    // (le client peut voir un lap auto pas encore supprimé alors que le serveur le supprime puis recalcule)
  }

  function undoLap() {
    if (!race.laps.length) return
    if (onUndoLastLap) {
      onUndoLastLap()
    } else {
      // Fallback: shim-based optimistic update
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
    }
    pushToast && pushToast('Dernière action annulée', 'Undo2')
  }

  function deleteLap(lapId: string) {
    // Prefer direct callback (Convex docId) — fallback to setRace shim
    if (onUndoLap && lapId.startsWith('k') /* Convex id heuristic */ === false) {
      // The id passed is the convex _id; just delegate
    }
    if (onUndoLap) {
      onUndoLap(lapId)
    } else {
      setRace((r) => ({ ...r, laps: r.laps.filter((l) => (l._id || l.id) !== lapId) }))
    }
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
    if (idx < 0) { setPickerOpen(null); return }
    const target = getRunner(runnerId)
    if (!window.confirm(`Mettre ${target?.name || '?'} comme coureur en piste ?\n\nL'ordre suivant sera repris à partir de lui.`)) {
      setPickerOpen(null)
      return
    }
    if (onSetCurrentIdx) onSetCurrentIdx(idx)
    else setRace((r) => ({ ...r, currentIdx: idx }))
    pushToast && pushToast(`Coureur courant → ${target?.name}`, 'UserCheck')
    setPickerOpen(null)
  }

  // Expected lap duration: prefer liveKm (auto-calibrated from last manual Top) if its lap is within admin bounds,
  // else fallback to configured target (kmMin/kmSec). On relay, server clears liveKm → fallback applies.
  const expectedLapMs = (() => {
    if (!currentRunner) return 0
    if (currentRunner.liveKmMin != null && currentRunner.liveKmSec != null) {
      const liveLapMs = kmPaceToLapMs(currentRunner.liveKmMin, currentRunner.liveKmSec)
      if (liveLapMs >= minLapSec * 1000 && liveLapMs <= maxLapSec * 1000) return liveLapMs
    }
    return kmPaceToLapMs(currentRunner.kmMin, currentRunner.kmSec)
  })()
  // effCurrentLapMs = effective elapsed since last NON-tentative lap (so values stay stable during auto replace window)
  // (effCurrentLapMs is computed below; alias here for downstream usage)

  // Detect tentative auto: if last lap is AUTO and within admin replace window, treat as tentative
  const replaceWindowMs = (replaceAutoWindowSec ?? 180) * 1000
  const lastRealLap = realLaps[realLaps.length - 1]
  const lastIsAuto = !!lastRealLap && isAutoTypeStr(lastRealLap.type)
  const sinceLastLap = lastRealLap ? now - lastRealLap.timestamp : Infinity
  const withinAutoReplace = lastIsAuto && sinceLastLap <= replaceWindowMs

  // "Effective" reference: ignore the tentative auto so buttons keep previous values.
  const effLaps = withinAutoReplace ? realLaps.slice(0, -1) : realLaps
  const effLastLap = effLaps[effLaps.length - 1]
  const effLastLapAt = effLastLap ? effLastLap.timestamp : (race.startTime || 0)
  const effCurrentLapMs = race.started && effLastLapAt ? Math.max(0, now - effLastLapAt) : 0

  // Click allowed within the last 45s before estimated lap end (faster cap),
  // or right after an AUTO lap during the admin-defined replace window (so manual can replace it),
  // or any time when slide-to-unlock is active.
  const EARLY_CLICK_WINDOW_MS = 45_000
  const inWindow = race.started && expectedLapMs > 0 && effCurrentLapMs >= expectedLapMs - EARLY_CLICK_WINDOW_MS
  const canClick = race.started && (inWindow || forceUnlock || withinAutoReplace)
  const remainingToPassage = expectedLapMs > 0 ? expectedLapMs - effCurrentLapMs : 0
  const plannedLaps = Math.max(1, currentRunner?.plannedLaps || 1)
  const lapsRemainingInRelay = Math.max(0, plannedLaps - relayStats.lapsThisRelay)
  // Fractional progress within current lap (0..1)
  const currentLapProgress = expectedLapMs > 0 ? Math.min(1, effCurrentLapMs / expectedLapMs) : 0
  // Fractional remaining laps until relay (e.g. 1.3 = 1 full lap + 0.3 left of current)
  const fractionalRemaining = Math.max(0, lapsRemainingInRelay - currentLapProgress)
  const etaRelay = lapsRemainingInRelay > 0 ? Math.max(0, lapsRemainingInRelay * expectedLapMs - effCurrentLapMs) : 0

  return (
    <div className="page">
      <div className="grid live-grid">
        {/* Left column — hero */}
        <div className="grid" style={{ gap: 18, alignContent: 'start' }}>
          <div className="hero-card">
            <div className="progress-track"><div className="progress-fill" style={{ width: `${progress * 100}%` }} /></div>
            <div style={{ display: 'flex', gap: 18, marginTop: 14, flexWrap: 'wrap', color: 'var(--muted)', fontSize: 13 }}>
              <span>📍 {(totalDistanceM / 1000).toFixed(2)} km parcourus</span>
              <span>🏁 {projTotalLaps} tours</span>
              {realAvgMs > 0 && <span>⚡ Moy. {fmtLap(realAvgMs)}</span>}
              {projectedLaps > 0 && <span>🎯 Proj. {projectedLaps} t</span>}
            </div>

            {/* Current runner band */}
            {currentRunner && (
              <div className="runner-current">
                <Avatar name={currentRunner.name} color={currentRunner.color} size={56} />
                <div className="runner-meta">
                  <div className="role">Coureur en piste · {String(race.currentIdx + 1).padStart(2, '0')} / {order.length}</div>
                  <div className="name" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span>{currentRunner.name}</span>
                    {currentRunner.group && (
                      <span
                        className="badge"
                        style={{
                          fontSize: 10,
                          padding: '2px 8px',
                          background: 'oklch(0.86 0.20 135 / 0.18)',
                          color: 'oklch(0.92 0.20 135)',
                          border: '1px solid oklch(0.86 0.20 135 / 0.4)',
                        }}
                      >
                        Grp {currentRunner.group}
                      </span>
                    )}
                    {activeGroupEntry && (
                      <span
                        className="badge"
                        style={{
                          fontSize: 10,
                          padding: '2px 8px',
                          background: activeGroupEntry.status === 'active' ? 'oklch(0.78 0.18 80 / 0.22)' : 'var(--bg-2)',
                          color: activeGroupEntry.status === 'active' ? 'oklch(0.92 0.16 80)' : 'var(--muted)',
                          border: '1px solid ' + (activeGroupEntry.status === 'active' ? 'oklch(0.78 0.18 80 / 0.5)' : 'var(--border)'),
                        }}
                        title={activeGroupEntry.status === 'active'
                          ? `Mode groupe ${activeGroupEntry.groupName} actif — ${activeGroupEntry.remainingRelays} relais restants`
                          : `Mode groupe ${activeGroupEntry.groupName} en attente (le coureur en piste n'appartient pas au groupe)`}
                      >
                        {activeGroupEntry.status === 'active' ? '▶' : '⏸'} Mode {activeGroupEntry.groupName} · {activeGroupEntry.remainingRelays}t
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                    <StatusChip value={currentRunner.status} />
                    <EnergyBar value={currentRunner.energy} />
                    {(() => {
                      // Priority: explicit override (liveKm if reasonable) → last lap in current relay → cible config
                      let lastLapInRelay: any = null
                      for (let i = realLaps.length - 1; i >= 0; i--) {
                        const lp = realLaps[i]
                        if (isRelayType(lp.type)) break
                        if (lp.runnerId === currentRunnerId) { lastLapInRelay = lp; break }
                      }
                      let label = 'cible'
                      let km = { min: currentRunner.kmMin, sec: currentRunner.kmSec }
                      // 1) Explicit liveKm (manual modal or autocalib from manual top) — wins if reasonable
                      if (currentRunner.liveKmMin != null && currentRunner.liveKmSec != null) {
                        const liveLapMs = kmPaceToLapMs(currentRunner.liveKmMin, currentRunner.liveKmSec)
                        if (liveLapMs >= minLapSec * 1000 && liveLapMs <= maxLapSec * 1000) {
                          label = 'manuel'
                          km = { min: currentRunner.liveKmMin, sec: currentRunner.liveKmSec }
                          lastLapInRelay = null // skip lap-based fallback below
                        }
                      }
                      // 2) Lap-based fallback (auto/manuel)
                      if (label === 'cible' && lastLapInRelay) {
                        const isAutoLap = lastLapInRelay.type === 'checkpoint_auto' || lastLapInRelay.type === 'relay_auto'
                        label = isAutoLap ? 'auto' : 'manuel'
                        const k = lapMsToKmPace(lastLapInRelay.lapTime)
                        km = { min: k.min, sec: k.sec }
                      }
                      return (
                        <span className="hint">
                          Tour <span className="mono" style={{ color: 'var(--accent)', fontWeight: 600 }}>{race.started ? fmtLap(effCurrentLapMs) : '—'}</span>
                          {' · '}Allure {label}{' '}
                          <button
                            className="mono"
                            onClick={() => {
                              if (!setRunners) return
                              setEditPaceMin(km.min)
                              setEditPaceSec(km.sec)
                              setEditPaceOpen(true)
                            }}
                            title={setRunners ? 'Cliquer pour modifier l\'allure (manuel)' : undefined}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              padding: 0,
                              color: 'inherit',
                              font: 'inherit',
                              cursor: setRunners ? 'pointer' : 'default',
                              textDecoration: setRunners ? 'underline dotted' : 'none',
                            }}
                          >
                            {fmtKmPace(km.min, km.sec)}
                          </button>
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
                  <div className="relay-head" style={{ position: 'relative' }}>
                    <span className="relay-title">🔁 Relais en cours</span>
                    <span
                      className="relay-count"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                      onClick={() => setRelayEditOpen((v) => !v)}
                      title="Cliquer pour modifier le nombre de tours prévus"
                    >
                      <span className="mono">{(relayLaps.length + currentLapProgress).toFixed(1).replace('.', ',')}</span>
                      /<span className="mono">{plannedLaps}</span> tours
                      <button
                        className="btn ghost icon"
                        style={{ padding: 2, fontSize: 11, opacity: 0.6 }}
                        onClick={(e) => { e.stopPropagation(); setRelayEditOpen((v) => !v) }}
                        title="Ajouter / retirer un tour"
                      >
                        ✎
                      </button>
                    </span>
                    {relayEditOpen && (() => {
                      // Min planned = laps already done (+1 if currently mid-lap)
                      const minPlannedAllowed = Math.max(1, relayLaps.length + (currentLapProgress > 0 ? 1 : 0))
                      const canDecrease = plannedLaps > minPlannedAllowed
                      const updatePlanned = (delta: number) => {
                        if (!setRunners || !currentRunner) return
                        const next = plannedLaps + delta
                        if (next < minPlannedAllowed) return
                        setRunners((rs) => rs.map((r) => r.id === currentRunnerId ? { ...r, plannedLaps: next } : r))
                      }
                      return (
                        <div
                          style={{
                            position: 'absolute',
                            right: 0,
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
                            onClick={() => updatePlanned(+1)}
                            title="Augmenter le nombre de tours prévus pour ce relai"
                          >
                            +
                          </button>
                          <button
                            className="btn"
                            style={{ padding: '4px 12px', fontSize: 16, fontWeight: 700 }}
                            disabled={!canDecrease}
                            onClick={() => updatePlanned(-1)}
                            title={canDecrease
                              ? 'Diminuer le nombre de tours prévus'
                              : `Impossible — déjà ${minPlannedAllowed} tour(s) entamé(s)`}
                          >
                            −
                          </button>
                          <button
                            className="btn ghost icon"
                            style={{ padding: 4, fontSize: 12 }}
                            onClick={() => setRelayEditOpen(false)}
                            title="Fermer"
                          >
                            ✕
                          </button>
                        </div>
                      )
                    })()}
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
                        const isAuto = l.type === 'checkpoint_auto' || l.type === 'relay_auto'
                        // Snapshot of planned-at-start (immune to runner config edits)
                        const planAtStart = (relayLaps[0] as any)?.plannedAtStart ?? plannedLaps
                        // 'tour +' = manual checkpoint beyond planned (relai aurait dû être pris)
                        const extraPassage = l.type === 'checkpoint_manual' && (i + 1) > planAtStart
                        return (
                          <div key={l._id || l.id} className={`rl ${abnormal ? 'is-abn' : ''}`}>
                            <span className="rl-n mono">T{String(i + 1).padStart(2, '0')}</span>
                            <span
                              className="badge"
                              style={{
                                fontSize: 9,
                                padding: '1px 5px',
                                background: isAuto
                                  ? 'oklch(0.72 0.18 200 / 0.18)'
                                  : 'oklch(0.86 0.20 135 / 0.18)',
                                color: isAuto
                                  ? 'oklch(0.78 0.16 200)'
                                  : 'oklch(0.92 0.20 135)',
                              }}
                            >
                              {isAuto ? 'AUTO' : 'MAN.'}
                            </span>
                            {extraPassage && (
                              <span
                                className="badge mono"
                                style={{
                                  fontSize: 9,
                                  padding: '1px 5px',
                                  background: 'oklch(0.78 0.18 80 / 0.18)',
                                  color: 'oklch(0.92 0.16 80)',
                                }}
                                title={`Tour supplémentaire (relai prévu au tour ${plannedLaps})`}
                              >
                                tour +
                              </span>
                            )}
                            <button
                              className="rl-t mono"
                              onClick={() => {
                                if (!onUpdateLapTime) return
                                const totalSec = Math.round(l.lapTime / 1000)
                                setEditMin(Math.floor(totalSec / 60))
                                setEditSec(totalSec % 60)
                                setEditTimeFor({ lapId: l._id || l.id, lapNumber: i + 1 })
                              }}
                              title="Cliquer pour corriger le temps"
                              style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: onUpdateLapTime ? 'pointer' : 'default',
                                padding: 0,
                                color: 'inherit',
                                font: 'inherit',
                                textDecoration: onUpdateLapTime ? 'underline dotted' : 'none',
                              }}
                            >
                              {fmtLap(l.lapTime)}
                            </button>
                            <span className="rl-p mono">{fmtPace(l.lapTime)}</span>
                            {abnormal && <span className="rl-flag">⚠️</span>}
                            {l.lapTime < minLapSec * 1000 && (
                              <button
                                className="btn ghost icon"
                                style={{ padding: 3 }}
                                onClick={() => deleteLap(l._id || l.id)}
                                title={`Supprimer (tour < ${minLapSec}s — anomalie)`}
                              >
                                ✕
                              </button>
                            )}
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
                    disabled={!canClick}
                    onClick={() => recordLap(false)}
                  >
                    <span className="label-top">Passage</span>
                    <span className="label-main mono">
                      {!race.started
                        ? '—'
                        : team?.autoPaused
                          ? '⏸ PAUSE'
                          : remainingToPassage > 0
                            ? `Estim. ${fmtLap(remainingToPassage)}`
                            : lapsRemainingInRelay === 0
                              ? 'Tour supplémentaire'
                              : "Passe maint après l'estim"}
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
                    disabled={!canClick}
                    onClick={() => recordLap(true)}
                  >
                    <span className="label-top">
                      Relai → {nextRunner?.name || '—'}
                      {nextRunner?.status === 'uncertain' && (
                        <span
                          className="badge"
                          style={{
                            marginLeft: 6,
                            fontSize: 10,
                            background: 'oklch(0.82 0.17 70 / 0.20)',
                            color: 'oklch(0.92 0.17 70)',
                            border: '1px solid oklch(0.82 0.17 70 / 0.55)',
                            padding: '1px 5px',
                            borderRadius: 4,
                          }}
                          title="Coureur incertain"
                        >
                          ? Incertain
                        </span>
                      )}
                    </span>
                    <span className="label-main mono">
                      {!race.started ? '—' : team?.autoPaused ? '⏸ PAUSE' : etaRelay > 0 ? `Estim. ${fmtLap(etaRelay)}` : 'maintenant'}
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
              {(() => {
                const lastLap = race.laps[race.laps.length - 1]
                const fixLapMs = currentRunner ? kmPaceToLapMs(currentRunner.kmMin, currentRunner.kmSec) : 0
                const sinceLastMs = lastLap ? now - lastLap.timestamp : Infinity
                const canUndo = !!lastLap && fixLapMs > 0 && sinceLastMs < fixLapMs * 0.5
                return (
                  <button
                    className="btn ghost"
                    disabled={!canUndo}
                    title={canUndo
                      ? `Dernier enregistrement il y a ${fmtLap(sinceLastMs)} (< 50% du temps fix)`
                      : 'Annulation impossible — délai depuis dernier tour > 50% du temps fix du coureur'}
                    onClick={() => {
                      if (!canUndo) return
                      if (!window.confirm(`Annuler le dernier tour enregistré ?\n\n(il y a ${fmtLap(sinceLastMs)})`)) return
                      undoLap()
                    }}
                  >
                    ↩ Annuler dernier
                  </button>
                )
              })()}
              {onSetAutoPaused && !team?.autoPaused && (
                <button
                  className="btn ghost"
                  onClick={() => {
                    if (!window.confirm("Marquer l'équipe en retard inconnu ?\n\nLa cron auto sera mise en pause et les boutons Passage / Relai débloqués pour saisie manuelle.")) return
                    onSetAutoPaused(true)
                    setForceUnlock(true)
                    setSlideVal(100)
                  }}
                  title="Stopper l'auto-validation — Passage ou Relai manuel la relancera"
                >
                  ⏸ Retard inconnu
                </button>
              )}
              {team?.autoPaused && (
                <span
                  className="badge"
                  style={{
                    fontSize: 12,
                    padding: '6px 12px',
                    borderRadius: 999,
                    background: 'oklch(0.78 0.18 80 / 0.18)',
                    color: 'oklch(0.92 0.16 80)',
                    border: '1px solid oklch(0.78 0.18 80 / 0.5)',
                  }}
                >
                  ⏸ Retard inconnu — Top/Relai pour reprendre
                </span>
              )}
              {/* Slide-to-unlock — force-enables Top/Relai when locked (hidden during auto pause: already unlocked) */}
              {!inWindow && race.started && !team?.autoPaused && (
                <div
                  className={`unlock-slider ${forceUnlock ? 'is-active' : ''}`}
                  style={{ ['--slide' as any]: (forceUnlock ? 100 : slideVal) + '%' }}
                >
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={forceUnlock ? 100 : slideVal}
                    onChange={(e) => setSlideVal(+e.target.value)}
                    onPointerUp={() => {
                      if (slideVal >= 95) setForceUnlock(true)
                      else setSlideVal(0)
                    }}
                    onTouchEnd={() => {
                      if (slideVal >= 95) setForceUnlock(true)
                      else setSlideVal(0)
                    }}
                    aria-label="Glisser pour débloquer Top/Relai"
                  />
                  <span className="unlock-label">
                    {forceUnlock ? '🔓 Débloqué' : '→ Glisser pour débloquer'}
                  </span>
                </div>
              )}
              {forceUnlock && inWindow && (
                <button
                  className="btn ghost"
                  onClick={() => { setForceUnlock(false); setSlideVal(0) }}
                  title="Reverrouiller"
                >
                  🔒 Reverrouiller
                </button>
              )}
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
                  progress={
                    race.started && expectedLapMs > 0
                      ? team?.autoPaused
                        ? 0.92 // freeze marker just before finish line while paused
                        : (effCurrentLapMs / expectedLapMs) % 1
                      : undefined
                  }
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

      {editPaceOpen && setRunners && currentRunner && (() => {
        const lapMs = kmPaceToLapMs(editPaceMin, editPaceSec)
        const minMs = minLapSec * 1000
        const maxMs = maxLapSec * 1000
        const tooFast = lapMs > 0 && lapMs < minMs
        const tooSlow = lapMs > maxMs
        const valid = lapMs >= minMs && lapMs <= maxMs
        return (
          <Modal
            title={`Allure manuelle · ${currentRunner.name}`}
            icon="⚡"
            onClose={() => setEditPaceOpen(false)}
            footer={
              <>
                <button className="btn ghost" onClick={() => setEditPaceOpen(false)}>Annuler</button>
                <button
                  className="btn primary"
                  disabled={!valid}
                  onClick={() => {
                    setRunners((rs) => rs.map((r) => r.id === currentRunnerId ? { ...r, liveKmMin: editPaceMin, liveKmSec: editPaceSec } : r))
                    setEditPaceOpen(false)
                    pushToast && pushToast(`Allure manuelle ${editPaceMin}:${String(editPaceSec).padStart(2, '0')}/km`, 'Flag')
                  }}
                >
                  ✓ Appliquer
                </button>
              </>
            }
          >
            <div className="hint" style={{ marginBottom: 12 }}>
              Saisissez l'allure manuelle au km. Elle sera utilisée comme override jusqu'au prochain relai (qui réinitialise sur la cible du nouveau coureur).
            </div>
            <div className="field">
              <span className="field-label">Allure /km (min : sec)</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number"
                  min="0"
                  max="20"
                  className="mono"
                  value={editPaceMin}
                  onChange={(e) => setEditPaceMin(Math.max(0, +e.target.value || 0))}
                  style={{ width: 80, textAlign: 'center', fontSize: 18 }}
                />
                <span style={{ fontSize: 20, color: 'var(--muted)' }}>:</span>
                <input
                  type="number"
                  min="0"
                  max="59"
                  className="mono"
                  value={editPaceSec}
                  onChange={(e) => setEditPaceSec(Math.min(59, Math.max(0, +e.target.value || 0)))}
                  style={{ width: 80, textAlign: 'center', fontSize: 18 }}
                />
                <span style={{ marginLeft: 8, color: 'var(--muted)', fontSize: 13 }}>min : sec /km</span>
              </div>
            </div>
            <div className="hint mono" style={{ marginTop: 8 }}>
              Tour estimé : <strong>{fmtLap(lapMs)}</strong>{' '}
              (bornes admin : tour {fmtLap(minMs)} → {fmtLap(maxMs)})
            </div>
            {tooFast && (
              <div className="hint" style={{ color: 'oklch(0.85 0.16 25)', marginTop: 4 }}>
                ⚠️ Trop rapide — minimum tour {fmtLap(minMs)}.
              </div>
            )}
            {tooSlow && (
              <div className="hint" style={{ color: 'oklch(0.85 0.16 25)', marginTop: 4 }}>
                ⚠️ Trop lent — maximum tour {fmtLap(maxMs)}.
              </div>
            )}
          </Modal>
        )
      })()}

      {editTimeFor && onUpdateLapTime && (
        <Modal
          title={`Corriger le temps · T${String(editTimeFor.lapNumber).padStart(2, '0')}`}
          icon="⏱️"
          onClose={() => setEditTimeFor(null)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setEditTimeFor(null)}>Annuler</button>
              <button
                className="btn primary"
                onClick={() => {
                  const ms = (editMin * 60 + editSec) * 1000
                  if (ms <= 0) return
                  onUpdateLapTime(editTimeFor.lapId, ms)
                  setEditTimeFor(null)
                }}
                disabled={editMin === 0 && editSec === 0}
              >
                ✓ Enregistrer
              </button>
            </>
          }
        >
          <div className="hint" style={{ marginBottom: 12 }}>
            Saisissez le nouveau temps de tour (minutes : secondes).
          </div>
          <div className="field">
            <span className="field-label">Temps du tour</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number"
                min="0"
                max="59"
                className="mono"
                value={editMin}
                onChange={(e) => setEditMin(Math.max(0, +e.target.value || 0))}
                style={{ width: 80, textAlign: 'center', fontSize: 18 }}
              />
              <span style={{ fontSize: 20, color: 'var(--muted)' }}>:</span>
              <input
                type="number"
                min="0"
                max="59"
                className="mono"
                value={editSec}
                onChange={(e) => setEditSec(Math.min(59, Math.max(0, +e.target.value || 0)))}
                style={{ width: 80, textAlign: 'center', fontSize: 18 }}
              />
              <span style={{ marginLeft: 8, color: 'var(--muted)', fontSize: 13 }}>min : sec</span>
            </div>
          </div>
        </Modal>
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
  // Limit modal to current runner in piste only — opened from "Gérer" button in runner band
  const onlyIds = order.length > 0 ? [order[currentIdx % order.length]] : []
  return (
    <Modal title="Gérer le coureur en piste" icon="⚙️" onClose={onClose}
      footer={<button className="btn primary" onClick={onClose}>Terminé</button>}>
      <div className="hint" style={{ marginBottom: 12 }}>
        Mettez à jour énergie, statut, et allure live du coureur actuellement en piste.
      </div>
      <div className="grid" style={{ gap: 10 }}>
        {onlyIds.map((id) => {
          const idx = order.indexOf(id)
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
