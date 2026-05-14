import React, { useRef, useState } from 'react'
import { kmPaceToLapMs } from '../lib/race-data'
import { EnergyBar } from './EnergyBar'
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
  groupModeQueue?: GroupModeEntry[]
  onSetRunnerGroup?: (runnerLocalId: string, group: string | undefined) => void
  onEnqueueGroupMode?: (groupName: string, remainingRelays: number) => void
  onCancelGroupModeEntry?: (index: number) => void
  onStopActiveGroupMode?: () => void
}

export function PlanningScreen({
  runners,
  setRunners,
  order,
  setOrder,
  schedule,
  onContinue,
  onBack,
  groupModeQueue,
  onSetRunnerGroup,
  onEnqueueGroupMode,
  onCancelGroupModeEntry,
  onStopActiveGroupMode,
}: PlanningScreenProps) {
  const dragId = useRef<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [editRunnerId, setEditRunnerId] = useState<string | null>(null)
  const [groupModeFor, setGroupModeFor] = useState<string | null>(null)
  const [groupModeNb, setGroupModeNb] = useState(2)

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

  // Sequence des passages : chaque coureur × plannedLaps consécutifs, puis suivant
  const expandedSequence: Array<{ id: string; runner: Runner; slotIdx: number; slotTotal: number; isRelay: boolean }> = []
  activeOrder.forEach(id => {
    const r = getRunner(id)
    if (!r) return
    const planned = Math.max(1, r.plannedLaps || 1)
    for (let k = 0; k < planned; k++) {
      expandedSequence.push({ id, runner: r, slotIdx: k + 1, slotTotal: planned, isRelay: k === planned - 1 })
    }
  })

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
              <div className="hint" style={{ marginBottom: 10 }}>
                Aperçu des {Math.min(12, expandedSequence.length)} prochains tours selon les tours prévus de chaque coureur :
              </div>
              <div className="grid" style={{ gap: 6 }}>
                {(() => {
                  const startMs = schedule?.startISO ? new Date(schedule.startISO).getTime() : null
                  let cum = 0
                  return expandedSequence.slice(0, 12).map((s, i) => {
                    const r = s.runner
                    const lapMs = kmPaceToLapMs(r.kmMin, r.kmSec)
                    cum += lapMs
                    const eta = startMs ? new Date(startMs + cum) : null
                    return (
                      <div
                        key={i}
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
                          {String(i + 1).padStart(2, '0')}
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
                          {s.isRelay && s.slotTotal > 1 && (
                            <span className="badge accent" style={{ fontSize: 10, flexShrink: 0 }}>
                              relais
                            </span>
                          )}
                        </span>
                        <span className="mono" style={{ color: 'var(--text-2)', fontSize: 13, flexShrink: 0, whiteSpace: 'nowrap' }}>
                          {fmtKmPace(r.kmMin, r.kmSec)}
                        </span>
                        {eta && (
                          <span
                            className="mono"
                            style={{
                              color: 'var(--accent)',
                              fontSize: 12,
                              textAlign: 'right',
                              flexShrink: 0,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            → {String(eta.getHours()).padStart(2, '0')}:{String(eta.getMinutes()).padStart(2, '0')}:{String(eta.getSeconds()).padStart(2, '0')}
                          </span>
                        )}
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