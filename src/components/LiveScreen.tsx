import React, { useEffect, useRef, useState } from 'react'
import { fmtLap, fmtPace, kmPaceToLapMs, LAP_DISTANCE_M } from '../lib/race-data'
import { Avatar } from './Avatar'
import { EnergyBar } from './EnergyBar'
import { GpxMap } from './GpxMap'
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
}

interface Race {
  started: boolean
  startTime: number | null
  laps: any[]
  currentIdx: number
}

interface LiveScreenProps {
  runners: Runner[]
  order: string[]
  race: Race
  setRace: React.Dispatch<React.SetStateAction<Race>>
  onBack: () => void
}

export function LiveScreen({ runners, order, race, setRace, onBack }: LiveScreenProps) {
  const [now, setNow] = useState(Date.now())
  const lastRecordAtRef = useRef(0)
  const MIN_LAP_GAP_MS = 5000

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const RACE_DURATION_MS = 24 * 3600 * 1000
  const elapsed = race.started ? Math.min(now - (race.startTime || 0), RACE_DURATION_MS) : 0
  const progress = race.started ? Math.min(1, elapsed / RACE_DURATION_MS) : 0

  function getRunner(id: string) {
    return runners.find(r => r.id === id)
  }

  const currentRunnerId = order[race.currentIdx % order.length]
  const currentRunner = getRunner(currentRunnerId)

  const lastLapAt = race.laps.length ? race.laps[race.laps.length - 1].timestamp : (race.startTime || 0)
  const currentLapMs = race.started ? now - lastLapAt : 0

  const totalLaps = race.laps.filter(l => l.type !== 'position').length
  const totalDistanceM = totalLaps * LAP_DISTANCE_M

  const realAvgMs = race.laps.length
    ? race.laps.filter(l => l.type !== 'position').reduce((a, l) => a + l.lapTime, 0) / totalLaps
    : 0

  const bestLap = race.laps.length
    ? race.laps.filter(l => l.type !== 'position').reduce((m, l) => l.lapTime < m.lapTime ? l : m)
    : null

  function recordLap(change: boolean) {
    const ts = Date.now()
    if (ts - lastRecordAtRef.current < MIN_LAP_GAP_MS) {
      alert(`Trop rapide — attends ${Math.ceil((MIN_LAP_GAP_MS - (ts - lastRecordAtRef.current)) / 1000)}s`)
      return
    }
    lastRecordAtRef.current = ts

    const nIdx = change ? (race.currentIdx + 1) % order.length : race.currentIdx
    const refTs = race.laps.length ? race.laps[race.laps.length - 1].timestamp : race.startTime

    setRace(r => {
      const lapTime = ts - (refTs || 0)
      const newLap = {
        id: 'l' + ts,
        runnerId: currentRunnerId,
        timestamp: ts,
        lapTime,
        type: change ? 'relay' : 'top',
        lapNumber: r.laps.filter(l => l.type !== 'position').length + 1,
      }
      return { ...r, laps: [...r.laps, newLap], currentIdx: nIdx }
    })
  }

  function undoLap() {
    if (!race.laps.length) return
    setRace(r => {
      const last = r.laps[r.laps.length - 1]
      return {
        ...r,
        laps: r.laps.slice(0, -1),
        currentIdx: last.type === 'relay' ? (r.currentIdx - 1 + order.length) % order.length : r.currentIdx,
      }
    })
  }

  const expectedLapMs = currentRunner ? kmPaceToLapMs(currentRunner.kmMin, currentRunner.kmSec) : 0
  const remainingToPassage = expectedLapMs > 0 ? expectedLapMs - currentLapMs : 0

  return (
    <div className="page">
      <div className="grid live-grid">
        {/* Left column - hero card */}
        <div className="grid" style={{ gap: 18, alignContent: 'start' }}>
          <div className="hero-card">
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
            </div>
            <div style={{ display: 'flex', gap: 18, marginTop: 14, flexWrap: 'wrap', color: 'var(--muted)', fontSize: 13 }}>
              <span>📍 {(totalDistanceM / 1000).toFixed(2)} km parcourus</span>
              <span>🏁 {totalLaps} tours</span>
              {realAvgMs > 0 && <span>⚡ Moy. {fmtLap(realAvgMs)}</span>}
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
                    <span className="hint">
                      Tour{' '}
                      <span className="mono" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                        {race.started ? fmtLap(currentLapMs) : '—'}
                      </span>
                      {' · '}Allure estim.{' '}
                      <span className="mono">
                        {currentRunner.kmMin}:{String(currentRunner.kmSec).padStart(2, '0')}/km
                      </span>
                    </span>
                  </div>
                </div>
                <div className="runner-pace">
                  <div className="v">{currentRunner.kmMin}:{String(currentRunner.kmSec).padStart(2, '0')}</div>
                  <div className="l">Cible / km</div>
                </div>
              </div>
            )}

            {/* Controls */}
            <div className="controls">
              {!race.started ? (
                <button className="big-btn start" style={{ gridColumn: '1 / -1' }} disabled>
                  <span className="label-top">Course non démarrée</span>
                  <span className="label-main">Attendez le signal de départ</span>
                  <span className="label-sub">Le départ est géré par l'administrateur</span>
                </button>
              ) : race.laps.length === 0 ? (
                <button className="big-btn start" style={{ gridColumn: '1 / -1' }} onClick={() => recordLap(false)}>
                  <span className="label-top">Démarrage tardif</span>
                  <span className="label-main">Lancer avec {currentRunner?.name || '—'}</span>
                  <span className="label-sub">Premier passage validé</span>
                </button>
              ) : (
                <>
                  <button className="big-btn top" disabled={!race.started} onClick={() => recordLap(false)}>
                    <span className="label-top">Top passage</span>
                    <span className="label-main mono">
                      {remainingToPassage > 0 ? `dans ${fmtLap(remainingToPassage)}` : 'fin de passage'}
                    </span>
                    <span className="label-sub">Tour validé · {currentRunner?.name}</span>
                  </button>
                  <button className="big-btn relay" disabled={!race.started} onClick={() => recordLap(true)}>
                    <span className="label-top">Relais</span>
                    <span className="label-main mono">maintenant</span>
                    <span className="label-sub">Passer le relais au coureur suivant</span>
                  </button>
                </>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn ghost" onClick={undoLap} disabled={!race.laps.length}>
                ↩ Annuler dernier
              </button>
              <button className="btn ghost" onClick={onBack}>
                ← Retour au planning
              </button>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="grid" style={{ gap: 18, alignContent: 'start' }}>
          {/* Mini circuit */}
          <div className="card">
            <div className="card-head">
              <span>🗺️</span>
              <h3>Circuit</h3>
              <span className="badge" style={{ marginLeft: 'auto' }}>{LAP_DISTANCE_M} m</span>
            </div>
            <div className="card-body" style={{ paddingTop: 10 }}>
              <GpxMap
                height={180}
                showLabel={false}
                progress={race.started && expectedLapMs > 0 ? currentLapMs / expectedLapMs : undefined}
              />
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

          {/* Lap history */}
          <div className="card">
            <div className="card-head">
              <span>📜</span>
              <h3>Historique des tours · {totalLaps}</h3>
            </div>
            <div className="card-body">
              {race.laps.length === 0 ? (
                <div className="empty">Aucun tour pour l'instant.</div>
              ) : (
                <div className="laps">
                  {race.laps
                    .filter(l => l.type !== 'position')
                    .slice()
                    .reverse()
                    .slice(0, 10)
                    .map(l => {
                      const r = getRunner(l.runnerId)
                      const expectedMs = r ? kmPaceToLapMs(r.kmMin, r.kmSec) : 0
                      const isAbnormal = expectedMs > 0 && l.lapTime > expectedMs * 2
                      return (
                        <div
                          key={l.id}
                          className={`lap is-${l.type}`}
                          style={isAbnormal ? { borderColor: 'oklch(0.72 0.21 25 / 0.4)', background: 'oklch(0.72 0.21 25 / 0.06)' } : undefined}
                        >
                          <span className="num">{String(l.lapNumber).padStart(3, '0')}</span>
                          <span className="who">
                            <span
                              style={{
                                display: 'inline-block',
                                width: 8,
                                height: 8,
                                borderRadius: 999,
                                background: r?.color,
                                marginRight: 8,
                                verticalAlign: 'middle',
                              }}
                            />
                            {r?.name}
                            {l.type === 'virtual' && (
                              <span className="chip" style={{ marginLeft: 8, padding: '1px 6px', fontSize: 10, background: 'oklch(0.78 0.18 80 / 0.15)', color: 'oklch(0.88 0.15 80)' }}>
                                virtuel
                              </span>
                            )}
                            {isAbnormal && (
                              <span className="chip status-out" style={{ marginLeft: 8, padding: '1px 6px', fontSize: 10 }}>
                                approx.
                              </span>
                            )}
                          </span>
                          <span className="time">{fmtLap(l.lapTime)}</span>
                          <span className="pace">{fmtPace(l.lapTime)}</span>
                        </div>
                      )
                    })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}