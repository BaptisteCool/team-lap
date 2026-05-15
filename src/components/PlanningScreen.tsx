import React, { useEffect, useRef, useState } from 'react'
import { kmPaceToLapMs, lapMsToKmPace } from '../lib/race-data'
import { EnergyBar } from './EnergyBar'
import { StatusChip } from './StatusChip'
import { WeatherBadge } from './WeatherBadge'
import { WeatherSummaryBanner, type HourlyForecast } from './WeatherSummaryBanner'

interface Runner {
  id: string
  name: string
  kmMin: number
  kmSec: number
  color: string
  energy: number
  status: string
  plannedLaps: number
  group?: string
}

export type GroupModeEntry = {
  groupName: string
  remainingRelays: number
  status: 'active' | 'pending'
}

interface Schedule {
  startISO: string
  endISO: string
}

interface PlanningScreenProps {
  runners: Runner[]
  setRunners?: React.Dispatch<React.SetStateAction<Runner[]>>
  order: string[]
  setOrder: React.Dispatch<React.SetStateAction<string[]>>
  schedule: Schedule
  onContinue: () => void
  onBack: () => void
  raceStartTime?: number | null
  currentIdx?: number
  currentRunnerLapsDone?: number
  currentRunnerExpectedLapMs?: number
  currentLapStartedAt?: number | null
  groupModeQueue?: GroupModeEntry[]
  onSetRunnerGroup?: (runnerLocalId: string, group: string | undefined) => void
  onEnqueueGroupMode?: (groupName: string, remainingRelays: number) => void
  onCancelGroupModeEntry?: (index: number) => void
  onStopActiveGroupMode?: () => void
  // Weather forecast (resolved provider). null/undefined → bandeau + badges masqués.
  weatherForecast?: HourlyForecast | null
  weatherUnavailable?: { reason: string } | null
  // Banner click → open source picker dialog
  onOpenWeatherDialog?: () => void
  weatherProviderLabel?: string
  weatherCityName?: string | null
}

export function PlanningScreen({
  runners,
  setRunners,
  order,
  setOrder,
  schedule,
  onContinue,
  onBack,
  raceStartTime,
  currentIdx,
  currentRunnerLapsDone,
  currentRunnerExpectedLapMs,
  currentLapStartedAt,
  groupModeQueue,
  onSetRunnerGroup,
  onEnqueueGroupMode,
  onCancelGroupModeEntry,
  onStopActiveGroupMode,
  weatherForecast,
  weatherUnavailable,
  onOpenWeatherDialog,
  weatherProviderLabel,
  weatherCityName,
}: PlanningScreenProps) {
  // Helper: pick hourly index closest to a target ms epoch.
  function weatherIndexForTime(target: number): number | null {
    if (!weatherForecast?.time?.length) return null
    let best = -1
    let bestDelta = Infinity
    for (let i = 0; i < weatherForecast.time.length; i++) {
      const d = Math.abs(weatherForecast.time[i] - target)
      if (d < bestDelta) {
        bestDelta = d
        best = i
      }
    }
    // Don't show weather more than 2h away from any hourly slot
    if (best < 0 || bestDelta > 2 * 60 * 60 * 1000) return null
    return best
  }
  const dragId = useRef<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [editRunnerId, setEditRunnerId] = useState<string | null>(null)
  const [groupModeFor, setGroupModeFor] = useState<string | null>(null)
  const [groupModeNb, setGroupModeNb] = useState(2)
  // Filter "Prochains passages" on a single runner (null = all). Not persisted.
  const [filterRunnerId, setFilterRunnerId] = useState<string | null>(null)
  // Tick to refresh ETAs in real time (current runner's elapsed lap + group queue countdowns)
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  function getRunner(id: string) {
    return runners.find(r => r.id === id)
  }

  function onDragStart(e: React.DragEvent, id: string) {
    dragId.current = id
    e.dataTransfer.effectAllowed = 'move'
    try {
      e.dataTransfer.setData('text/plain', id)
    } catch (_) {}
  }

  function onDragOver(e: React.DragEvent, id: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (overId !== id) setOverId(id)
  }

  function onDrop(e: React.DragEvent, id: string) {
    e.preventDefault()
    const src = dragId.current
    if (!src || src === id) {
      dragId.current = null
      setOverId(null)
      return
    }
    if (!window.confirm("Modifier l'ordre des relais ?")) {
      dragId.current = null
      setOverId(null)
      return
    }
    setOrder(o => {
      const copy = o.slice()
      const sIdx = copy.indexOf(src)
      const tIdx = copy.indexOf(id)
      copy.splice(sIdx, 1)
      copy.splice(tIdx, 0, src)
      return copy
    })
    dragId.current = null
    setOverId(null)
  }

  function move(id: string, dir: number) {
    if (!window.confirm("Modifier l'ordre des relais ?")) return
    setOrder(o => {
      const copy = o.slice()
      const i = copy.indexOf(id)
      const j = i + dir
      if (j < 0 || j >= copy.length) return o
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
      return copy
    })
  }

  const activeOrder = order.filter(id => getRunner(id)?.status !== 'out')

  // Active group-mode entry — affects upcoming passes preview
  const activeGroupEntry = (groupModeQueue && groupModeQueue.length > 0) ? groupModeQueue[0] : null
  const groupActiveName = activeGroupEntry?.status === 'active' ? activeGroupEntry.groupName : null

  // Real-time current runner (from LiveScreen state)
  const currentRunnerId = (currentIdx != null && order.length > 0) ? order[currentIdx % order.length] : null
  const currentRunner = currentRunnerId ? getRunner(currentRunnerId) : null
  const lapsDoneCurrent = currentRunnerLapsDone ?? 0

  const expandedSequence: Array<{ id: string; runner: Runner; slotIdx: number; slotTotal: number; isRelay: boolean; groupTag?: string }> = []
  const pushRunnerFromSlot = (r: Runner, fromSlot: number, groupTag?: string) => {
    const planned = Math.max(1, r.plannedLaps || 1)
    for (let k = fromSlot; k < planned; k++) {
      expandedSequence.push({ id: r.id, runner: r, slotIdx: k + 1, slotTotal: planned, isRelay: k === planned - 1, groupTag })
    }
  }

  // 1) Current runner's REMAINING laps in current stint (skip if all done already → relai imminent)
  if (currentRunner) {
    const planned = Math.max(1, currentRunner.plannedLaps || 1)
    if (lapsDoneCurrent < planned) {
      pushRunnerFromSlot(currentRunner, lapsDoneCurrent, groupActiveName ?? undefined)
    }
  }

  // 2) After current runner finishes — group mode (if active) consumes N relays then normal rotation
  // Determine where to start in the order rotation (after current runner)
  const startIdx = (currentIdx != null && order.length > 0) ? (currentIdx + 1) % order.length : 0
  const orderedAfterCurrent: string[] = []
  for (let i = 0; i < activeOrder.length; i++) {
    const id = order[(startIdx + i) % order.length]
    if (activeOrder.includes(id) && id !== currentRunnerId) orderedAfterCurrent.push(id)
  }

  if (groupActiveName) {
    // Remaining group relays (counts the current one if currentRunner is in group and stint not done)
    let remaining = activeGroupEntry?.remainingRelays ?? 0
    // If current runner is in the group AND has remaining laps, his upcoming relai consumes 1
    if (currentRunner?.group === groupActiveName && lapsDoneCurrent < (currentRunner.plannedLaps || 1)) {
      remaining = Math.max(0, remaining - 1)
    }
    const groupOrder = orderedAfterCurrent.filter(id => getRunner(id)?.group === groupActiveName)
    let i = 0
    let safety = 0
    while (remaining > 0 && groupOrder.length > 0 && safety < 100) {
      const id = groupOrder[i % groupOrder.length]
      const r = getRunner(id)
      if (r) {
        pushRunnerFromSlot(r, 0, groupActiveName)
        remaining--
      }
      i++
      safety++
    }
    // After the group quota → normal rotation from where we are (use full activeOrder)
    activeOrder.forEach(id => {
      const r = getRunner(id)
      if (r) pushRunnerFromSlot(r, 0)
    })
  } else {
    // Normal rotation starting after current runner
    orderedAfterCurrent.forEach(id => {
      const r = getRunner(id)
      if (r) pushRunnerFromSlot(r, 0)
    })
    // Then loop back to current runner's group again (full cycle)
    activeOrder.forEach(id => {
      if (id === currentRunnerId) return
      const r = getRunner(id)
      if (r) pushRunnerFromSlot(r, 0)
    })
  }

  // Filter mode: extend expandedSequence with extra cycles until we find at least N
  // matches for the filtered runner (or hit safety cap). The unfiltered preview keeps
  // its current short window so default UX is unchanged.
  const FILTER_TARGET_MATCHES = 3
  const FILTER_MAX_ITERATIONS = 500
  if (filterRunnerId && activeOrder.length > 0) {
    let safety = 0
    let matches = expandedSequence.filter(s => s.id === filterRunnerId).length
    while (matches < FILTER_TARGET_MATCHES && safety < FILTER_MAX_ITERATIONS) {
      const before = expandedSequence.length
      activeOrder.forEach(id => {
        const r = getRunner(id)
        if (r) pushRunnerFromSlot(r, 0)
      })
      // Defensive: if appending nothing (all plannedLaps=0), break to avoid infinite loop
      if (expandedSequence.length === before) break
      matches = expandedSequence.filter(s => s.id === filterRunnerId).length
      safety++
    }
  }

  const totalMs = expandedSequence.reduce((a, s) => a + kmPaceToLapMs(s.runner.kmMin, s.runner.kmSec), 0)

  // Helper functions
  function fmtLap(ms: number): string {
    if (!ms || ms <= 0) return '—'
    const totalSec = Math.floor(ms / 1000)
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    const cs = Math.floor((ms % 1000) / 10)
    return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
  }

  function fmtKmPace(kmMin: number, kmSec: number): string {
    return `${kmMin}:${String(kmSec).padStart(2, '0')}/km`
  }

  return (
    <div className="page">
      <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr', gap: 18 }}>
        <div className="card">
          <div className="card-head">
            <span>📋</span>
            <h3>Ordre des relais</h3>
          </div>
          <div className="card-body">
            <div className="hint" style={{ marginBottom: 12 }}>
              Glissez‑déposez les coureurs pour définir l'ordre des relais. Cet ordre se répète en boucle pendant les 24h.
            </div>
            <div className="plan-list">
              {order.map((id, idx) => {
                const r = getRunner(id)
                if (!r) return null
                const lapMs = kmPaceToLapMs(r.kmMin, r.kmSec)
                const isOut = r.status === 'out'
                return (
                  <div
                    key={id}
                    className={`plan-row ${dragId.current === id ? 'dragging' : ''} ${overId === id ? 'drop-target' : ''}`}
                    style={{ opacity: isOut ? 0.45 : 1 }}
                    draggable
                    onDragStart={e => onDragStart(e, id)}
                    onDragOver={e => onDragOver(e, id)}
                    onDragLeave={() => setOverId(null)}
                    onDrop={e => onDrop(e, id)}
                    onDragEnd={() => {
                      dragId.current = null
                      setOverId(null)
                    }}
                  >
                    <span className="plan-handle" title="Déplacer">⋮⋮</span>
                    <span className="plan-num mono">{isOut ? '—' : String(idx + 1).padStart(2, '0')}</span>
                    <span className="plan-name" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          width: 10,
                          height: 10,
                          borderRadius: 3,
                          background: r.color,
                          verticalAlign: 'middle',
                        }}
                      />
                      <span style={{ textDecoration: isOut ? 'line-through' : 'none' }}>{r.name}</span>
                      <StatusChip value={r.status} />
                      <EnergyBar value={r.energy} />
                      {onSetRunnerGroup && (
                        <input
                          type="text"
                          value={r.group ?? ''}
                          onChange={(e) => onSetRunnerGroup(r.id, e.target.value || undefined)}
                          placeholder="grp"
                          maxLength={12}
                          style={{
                            width: 60,
                            fontSize: 11,
                            padding: '2px 6px',
                            background: r.group ? 'oklch(0.86 0.20 135 / 0.18)' : 'var(--bg-2)',
                            color: r.group ? 'oklch(0.92 0.20 135)' : 'var(--text-2)',
                            border: '1px solid ' + (r.group ? 'oklch(0.86 0.20 135 / 0.5)' : 'var(--border)'),
                            borderRadius: 6,
                          }}
                          title="Groupe (A, B, Nuit…) — vide = pas de groupe"
                        />
                      )}
                    </span>
                    <span className="plan-pace" style={{ position: 'relative' }}>
                      {fmtKmPace(r.kmMin, r.kmSec)}{' '}
                      <span style={{ color: 'var(--muted)' }}>· {fmtLap(lapMs)}</span>
                      <span
                        style={{ marginLeft: 8, color: 'var(--accent)', cursor: setRunners ? 'pointer' : 'default' }}
                        className="mono"
                        onClick={() => setRunners && setEditRunnerId((cur) => (cur === id ? null : id))}
                        title={setRunners ? 'Cliquer pour modifier le nombre de tours prévus' : undefined}
                      >
                        ×{r.plannedLaps || 1}
                      </span>
                      {setRunners && (
                        <button
                          className="btn ghost icon"
                          style={{ padding: 2, fontSize: 11, opacity: 0.6, marginLeft: 4 }}
                          onClick={() => setEditRunnerId((cur) => (cur === id ? null : id))}
                          title="Modifier le nombre de tours prévus"
                        >
                          ✎
                        </button>
                      )}
                      {editRunnerId === id && setRunners && (
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
                            onClick={() => {
                              setRunners((rs) => rs.map((rr) => rr.id === id ? { ...rr, plannedLaps: (rr.plannedLaps || 1) + 1 } : rr))
                            }}
                            title="Augmenter"
                          >
                            +
                          </button>
                          <button
                            className="btn"
                            style={{ padding: '4px 12px', fontSize: 16, fontWeight: 700 }}
                            disabled={(r.plannedLaps || 1) <= 1}
                            onClick={() => {
                              setRunners((rs) => rs.map((rr) => rr.id === id ? { ...rr, plannedLaps: Math.max(1, (rr.plannedLaps || 1) - 1) } : rr))
                            }}
                            title="Diminuer (mini 1)"
                          >
                            −
                          </button>
                          <button
                            className="btn ghost icon"
                            style={{ padding: 4, fontSize: 12 }}
                            onClick={() => setEditRunnerId(null)}
                            title="Fermer"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </span>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button className="btn ghost icon" onClick={() => move(id, -1)} disabled={idx === 0} title="Monter">
                        ↑
                      </button>
                      <button className="btn ghost icon" onClick={() => move(id, 1)} disabled={idx === order.length - 1} title="Descendre">
                        ↓
                      </button>
                    </div>
                    <span />
                  </div>
                )
              })}
            </div>

            <hr className="sep" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button className="btn ghost" onClick={onBack} style={{ flexShrink: 0 }}>
                ← Retour
              </button>
              <span className="hint" style={{ flex: '1 1 auto', minWidth: 0 }}>L'ordre sera modifiable en cours de course.</span>
              <button className="btn primary" style={{ marginLeft: 'auto', flexShrink: 0 }} onClick={onContinue}>
                🚀 Aller au tracker
              </button>
            </div>
          </div>
        </div>

        <div className="grid" style={{ gap: 18, alignContent: 'start' }}>
          {/* Groupes — mode relai de groupe (issue #1) */}
          {(onSetRunnerGroup || onEnqueueGroupMode) && (() => {
            const groups = Array.from(new Set(runners.map(r => r.group).filter(Boolean) as string[])).sort()
            const activeEntry = (groupModeQueue && groupModeQueue.length > 0) ? groupModeQueue[0] : null
            return (
              <div className="card">
                <div className="card-head">
                  <span>👥</span>
                  <h3>Groupes</h3>
                  <span className="hint" style={{ marginLeft: 'auto' }}>
                    {groups.length} groupe{groups.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="card-body grid" style={{ gap: 10 }}>
                  <div className="hint">
                    Assignez un groupe (A, B, "Nuit"…) à chaque coureur depuis sa carte. Lancez ensuite un mode "relai de groupe" pour que les autres se reposent.
                  </div>
                  {/* Active queue */}
                  {groupModeQueue && groupModeQueue.length > 0 && (
                    <div
                      className="card"
                      style={{
                        background: activeEntry?.status === 'active' ? 'oklch(0.86 0.20 135 / 0.12)' : 'var(--bg-2)',
                        border: '1px solid ' + (activeEntry?.status === 'active' ? 'oklch(0.86 0.20 135 / 0.4)' : 'var(--border)'),
                        padding: 10,
                      }}
                    >
                      <div className="field-label" style={{ marginBottom: 6 }}>
                        Mode actif{activeEntry?.status === 'pending' ? ' (en attente — coureur en piste hors groupe)' : ''}
                      </div>
                      {groupModeQueue.map((entry, i) => (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '6px 8px',
                            borderRadius: 8,
                            background: i === 0 ? 'transparent' : 'var(--bg)',
                            marginBottom: 4,
                          }}
                        >
                          <span className="badge accent" style={{ fontSize: 11 }}>
                            {i === 0 ? (entry.status === 'active' ? '▶' : '⏸') : '⏭'} Groupe {entry.groupName}
                          </span>
                          <span className="hint" style={{ flex: 1 }}>
                            {entry.remainingRelays} relais{entry.remainingRelays > 1 ? '' : ''} restant{entry.remainingRelays > 1 ? 's' : ''}
                          </span>
                          {i === 0 && onStopActiveGroupMode && (
                            <button
                              className="btn ghost"
                              style={{ fontSize: 11, padding: '4px 8px' }}
                              onClick={() => {
                                if (window.confirm(`Stopper le mode actif (groupe ${entry.groupName}) ?`)) onStopActiveGroupMode()
                              }}
                              title="Arrêter le mode actif (garde la queue)"
                            >
                              ⏹ Stop
                            </button>
                          )}
                          {onCancelGroupModeEntry && (
                            <button
                              className="btn ghost icon"
                              style={{ fontSize: 11, padding: 4 }}
                              onClick={() => {
                                if (window.confirm(`Supprimer cette entrée (groupe ${entry.groupName}) ?`)) onCancelGroupModeEntry(i)
                              }}
                              title="Supprimer cette entrée"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Group buttons */}
                  {groups.length === 0 ? (
                    <div className="empty">Aucun groupe défini. Ouvrez ✎ sur une ligne de coureur pour assigner un groupe.</div>
                  ) : (
                    <div className="grid" style={{ gap: 8 }}>
                      {groups.map((g) => {
                        const members = runners.filter(r => r.group === g)
                        return (
                          <div
                            key={g}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '8px 10px',
                              borderRadius: 8,
                              background: 'var(--bg-2)',
                              border: '1px solid var(--border)',
                            }}
                          >
                            <span className="badge accent" style={{ fontSize: 12 }}>Groupe {g}</span>
                            <span className="hint" style={{ flex: 1 }}>
                              {members.length} coureur{members.length > 1 ? 's' : ''} · {members.map(m => m.name).join(', ')}
                            </span>
                            {onEnqueueGroupMode && (
                              <button
                                className="btn"
                                style={{ fontSize: 12, padding: '4px 10px' }}
                                onClick={() => { setGroupModeFor(g); setGroupModeNb(2) }}
                                title={`Lancer mode groupe ${g}`}
                              >
                                ▶ Lancer
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

          <div className="card">
            <div className="card-head">
              <span>⏱️</span>
              <h3>Cycle complet</h3>
            </div>
            <div className="card-body">
              <div className="stat-row">
                <div className="stat">
                  <div className="stat-label">Coureurs actifs</div>
                  <div className="stat-value mono">
                    {activeOrder.length}
                    <span style={{ color: 'var(--muted)', fontSize: 14 }}> / {order.length}</span>
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-label">Cycle ({expandedSequence.length} t.)</div>
                  <div className="stat-value mono">{totalMs ? fmtLap(totalMs) : '—'}</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Cycles / 24h</div>
                  <div className="stat-value mono">{totalMs ? Math.floor((24 * 3600 * 1000) / totalMs) : '—'}</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Tours / 24h</div>
                  <div className="stat-value mono">
                    {totalMs ? Math.floor((24 * 3600 * 1000) / totalMs) * expandedSequence.length : '—'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <span>👁️</span>
              <h3>Prochains passages</h3>
            </div>
            <div className="card-body">
              {/* Weather summary (next 6h). Auto-hides if no forecast and no explicit unavailable reason. */}
              <WeatherSummaryBanner
                forecast={weatherForecast}
                unavailable={weatherUnavailable}
                onClick={onOpenWeatherDialog}
                providerLabel={weatherProviderLabel}
                cityName={weatherCityName}
              />
              {/* Filter on a runner — null = all */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <label className="hint" style={{ fontSize: 12 }}>Filtrer :</label>
                <select
                  value={filterRunnerId ?? ''}
                  onChange={(e) => setFilterRunnerId(e.target.value || null)}
                  style={{
                    padding: '4px 8px',
                    fontSize: 13,
                    background: 'var(--bg-2)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                  }}
                >
                  <option value="">Tous les coureurs</option>
                  {activeOrder.map(id => {
                    const r = getRunner(id)
                    if (!r) return null
                    return <option key={id} value={id}>{r.name}</option>
                  })}
                </select>
                {filterRunnerId && (
                  <button
                    className="btn ghost"
                    style={{ fontSize: 12, padding: '3px 8px' }}
                    onClick={() => setFilterRunnerId(null)}
                    title="Réinitialiser le filtre"
                  >
                    ✕ Réinitialiser
                  </button>
                )}
              </div>
              <div className="hint" style={{ marginBottom: 10 }}>
                {filterRunnerId
                  ? `Prochains passages de ${getRunner(filterRunnerId)?.name ?? '—'} :`
                  : `Aperçu des ${Math.min(12, expandedSequence.length)} prochains tours selon les tours prévus de chaque coureur :`}
              </div>
              <div className="grid" style={{ gap: 6 }}>
                {(() => {
                  // Anchor for ETA projection (#16):
                  // - race running (actualStart set) → live clock now
                  // - scheduled but not started → scheduledStart, but never in the past
                  //   (if scheduledStart already passed without top départ, fallback to now)
                  // - no scheduledStart at all → now
                  const now = Date.now()
                  const scheduledMs = schedule?.startISO ? new Date(schedule.startISO).getTime() : null
                  const startMs = raceStartTime
                    ? now
                    : (scheduledMs ? Math.max(scheduledMs, now) : now)
                  let cum = 0
                  let firstCurrentSeen = false
                  // Walk full expandedSequence to compute proper cumulative ETAs, then filter for display
                  const enriched = expandedSequence.map((s, i) => {
                    const r = s.runner
                    let lapMs: number
                    if (r.id === currentRunnerId && currentRunnerExpectedLapMs && currentRunnerExpectedLapMs > 0) {
                      // All current-runner laps use his ACTUAL effective pace (live or override)
                      lapMs = currentRunnerExpectedLapMs
                      // First occurrence: subtract elapsed already counted in current lap (live tick → real-time)
                      if (!firstCurrentSeen && currentLapStartedAt) {
                        const elapsed = Math.max(0, Date.now() - currentLapStartedAt)
                        lapMs = Math.max(0, lapMs - elapsed)
                        firstCurrentSeen = true
                      } else if (!firstCurrentSeen) {
                        firstCurrentSeen = true
                      }
                    } else {
                      lapMs = kmPaceToLapMs(r.kmMin, r.kmSec)
                    }
                    cum += lapMs
                    return { s, eta: new Date(startMs + cum), originalIdx: i }
                  })
                  const visible = filterRunnerId
                    ? enriched.filter(x => x.s.id === filterRunnerId).slice(0, FILTER_TARGET_MATCHES)
                    : enriched.slice(0, 12)
                  if (visible.length === 0 && filterRunnerId) {
                    return (
                      <div className="empty" style={{ padding: '12px 10px' }}>
                        Aucun passage planifié pour ce coureur.
                      </div>
                    )
                  }
                  return visible.map(({ s, eta, originalIdx }, idx) => {
                    const r = s.runner
                    // Display # = original position in full sequence (so filter mode shows real rank)
                    const displayNum = filterRunnerId ? originalIdx + 1 : idx + 1
                    return (
                      <div
                        key={originalIdx}
                        className="plan-preview-row"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '8px 10px',
                          borderRadius: 8,
                          background: 'var(--bg-2)',
                          borderLeft: s.isRelay ? `2px solid ${r.color}` : '2px solid transparent',
                          flexWrap: 'wrap',
                        }}
                      >
                        <span className="mono" style={{ color: 'var(--muted)', width: 26, flexShrink: 0 }}>
                          {String(displayNum).padStart(2, '0')}
                        </span>
                        <span style={{ width: 8, height: 8, borderRadius: 999, background: r.color, flexShrink: 0 }} />
                        <span
                          style={{
                            flex: '1 1 120px',
                            minWidth: 0,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            overflow: 'hidden',
                          }}
                        >
                          <span
                            style={{
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              minWidth: 0,
                            }}
                          >
                            {r.name}
                          </span>
                          <span className="mono" style={{ color: 'var(--muted)', fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {s.slotIdx}/{s.slotTotal}
                          </span>
                          {s.groupTag && (
                            <span
                              className="badge"
                              style={{
                                fontSize: 10,
                                flexShrink: 0,
                                background: 'oklch(0.78 0.18 80 / 0.18)',
                                color: 'oklch(0.92 0.16 80)',
                                border: '1px solid oklch(0.78 0.18 80 / 0.4)',
                              }}
                              title={`Mode groupe ${s.groupTag} actif`}
                            >
                              ▶ Grp {s.groupTag}
                            </span>
                          )}
                          {s.isRelay && s.slotTotal > 1 && (
                            <span className="badge accent" style={{ fontSize: 10, flexShrink: 0 }}>
                              relais
                            </span>
                          )}
                          {r.status === 'uncertain' && (
                            <span
                              className="badge"
                              style={{
                                fontSize: 10,
                                flexShrink: 0,
                                background: 'oklch(0.82 0.17 70 / 0.18)',
                                color: 'oklch(0.82 0.17 70)',
                                border: '1px solid oklch(0.82 0.17 70 / 0.5)',
                              }}
                              title="Coureur incertain"
                            >
                              ? Incertain
                            </span>
                          )}
                        </span>
                        <span
                          className="mono"
                          style={{ color: 'var(--text-2)', fontSize: 13, flexShrink: 0, whiteSpace: 'nowrap' }}
                          title={r.id === currentRunnerId && currentRunnerExpectedLapMs && currentRunnerExpectedLapMs > 0 ? 'Allure effective (live ou manuelle)' : 'Allure cible'}
                        >
                          {(() => {
                            // Current runner: derive pace from his EFFECTIVE lap time (live/manual override),
                            // consistent with the ETA above. Fallback to target if expectedLapMs missing/zero.
                            if (r.id === currentRunnerId && currentRunnerExpectedLapMs && currentRunnerExpectedLapMs > 0) {
                              const p = lapMsToKmPace(currentRunnerExpectedLapMs)
                              if (p && (p.min > 0 || p.sec > 0)) return fmtKmPace(p.min, p.sec)
                            }
                            return fmtKmPace(r.kmMin, r.kmSec)
                          })()}
                        </span>
                        <span
                          className="mono"
                          style={{
                            color: 'var(--accent)',
                            fontSize: 12,
                            textAlign: 'right',
                            flexShrink: 0,
                            whiteSpace: 'nowrap',
                          }}
                          title="Heure réelle Paris du passage estimé"
                        >
                          🕒 {eta.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Paris' })}
                        </span>
                        {(() => {
                          const idx = weatherIndexForTime(eta.getTime())
                          if (idx == null || !weatherForecast) return null
                          return (
                            <WeatherBadge
                              weatherCode={weatherForecast.weather_code[idx]}
                              temperature={weatherForecast.temperature_2m[idx]}
                              humidity={weatherForecast.relative_humidity_2m[idx]}
                              precipitation={weatherForecast.precipitation_probability[idx]}
                            />
                          )
                        })()}
                      </div>
                    )
                  })
                })()}
                {expandedSequence.length === 0 && <div className="empty">Tous les coureurs sont en abandon.</div>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {groupModeFor && onEnqueueGroupMode && (
        <div className="modal-backdrop" onClick={() => setGroupModeFor(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Lancer mode groupe {groupModeFor}</h3>
              <button className="btn ghost icon" style={{ marginLeft: 'auto' }} onClick={() => setGroupModeFor(null)}>✕</button>
            </div>
            <div className="modal-body grid" style={{ gap: 12 }}>
              <div className="hint">
                Le groupe <strong>{groupModeFor}</strong> enchaînera les N relais demandés. Pendant ce temps, les autres coureurs se reposent. À la fin, retour au planning normal (ou prochain mode dans la queue).
              </div>
              <div className="field">
                <span className="field-label">Nombre de relais *</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button type="button" className="btn" style={{ padding: '4px 12px', fontSize: 16 }} onClick={() => setGroupModeNb((n) => Math.max(1, n - 1))}>−</button>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    className="mono"
                    value={groupModeNb}
                    onChange={(e) => setGroupModeNb(Math.max(1, Math.min(30, +e.target.value || 1)))}
                    style={{ width: 80, textAlign: 'center' }}
                  />
                  <button type="button" className="btn" style={{ padding: '4px 12px', fontSize: 16 }} onClick={() => setGroupModeNb((n) => Math.min(30, n + 1))}>+</button>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setGroupModeFor(null)}>Annuler</button>
              <button
                className="btn primary"
                onClick={() => {
                  onEnqueueGroupMode(groupModeFor, groupModeNb)
                  setGroupModeFor(null)
                }}
              >
                ✓ Lancer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}