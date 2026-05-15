import React, { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { TestModeBadge } from './TestModeBadge';
import {
  SUPER_ADMIN_PIN,
  TEAM_CATEGORIES,
  fmtClock, fmtTime, toLocalDatetime
} from '../lib/race-data';

interface AdminState {
  schedule: { startISO: string; endISO: string }
  race: { started: boolean; startTime: number | null }
  interruptions: any[]
  password: string
  contact: { email: string; phone: string }
}

interface TeamInfo {
  id: string
  name: string
  // DEPRECATED per-team capacity (event.maxRunnersPerTeam is source of truth)
  maxRunners?: number
  pin: string
  category: string
  goalLaps: number
  color: string
  ready?: boolean
  profileImage?: string
  contactName?: string
  contactPhone?: string
}

interface Team {
  info: TeamInfo
  runners: any[]
  laps: any[]
  order: any[]
  currentIdx: number
}

interface AdminScreenProps {
  admin: AdminState
  setAdmin: React.Dispatch<React.SetStateAction<AdminState>>
  teamsById: Record<string, Team>
  addTeam: () => void
  updateTeamInfo: (id: string, patch: Partial<TeamInfo>) => void
  removeTeam: (id: string) => void
  startRaceNow: () => void
  startRaceAtScheduled: () => void
  stopRace: () => void
  correctActualStart: (isoString: string) => void
  resetRace: () => void
  pushToast: (text: string, icon?: string) => void
  // Event-level "max runners per team" (uniform across all teams). Default 10.
  maxRunnersPerTeam?: number
  onSetMaxRunnersPerTeam?: (value: number) => Promise<void> | void
  // Geo for weather (Met.no)
  latitude?: number | null
  longitude?: number | null
  cityName?: string | null
  onSetLatLng?: (lat: number | null, lng: number | null, cityName?: string | null) => Promise<void> | void
  // Relay transition penalty (seconds). Default 7. Range 0-60.
  relayTransitionSec?: number
  onSetRelayTransitionSec?: (seconds: number) => Promise<void> | void
  // Test mode (fast timings for QA)
  testMode?: boolean
  onSetTestMode?: (value: boolean) => Promise<void> | void
  // Lock state pour le toggle (true = verrouillé, ex: course démarrée ou < 10min avant départ)
  testModeLocked?: boolean
  testModeLockReason?: string
}

export function AdminScreen({
  admin,
  setAdmin,
  teamsById,
  addTeam,
  updateTeamInfo,
  removeTeam,
  startRaceNow,
  startRaceAtScheduled,
  stopRace,
  correctActualStart,
  resetRace,
  pushToast,
  maxRunnersPerTeam,
  onSetMaxRunnersPerTeam,
  latitude,
  longitude,
  cityName,
  onSetLatLng,
  relayTransitionSec,
  onSetRelayTransitionSec,
  testMode,
  onSetTestMode,
  testModeLocked,
  testModeLockReason,
}: AdminScreenProps) {
  const evRelayTransition = relayTransitionSec ?? 5
  const navigate = useNavigate()
  const evMaxRunners = maxRunnersPerTeam ?? 10
  const schedule = admin.schedule || { startISO: '', endISO: '' }
  const race = admin.race || { started: false, startTime: null }
  const interruptions = Array.isArray(admin.interruptions) ? admin.interruptions : []

  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Admin password change
  const [pwNew, setPwNew] = useState('')
  const [pwSuper, setPwSuper] = useState('')
  const [pwErr, setPwErr] = useState('')

  function submitPasswordChange() {
    setPwErr('')
    if (!pwNew || pwNew.length < 4) {
      setPwErr('Mot de passe trop court (4 caractères min).')
      return
    }
    if (pwSuper !== SUPER_ADMIN_PIN) {
      setPwErr('PIN super-admin incorrect.')
      return
    }
    if (!window.confirm(`Changer le mot de passe administrateur ?\n\nNouveau mot de passe : "${pwNew}"`)) return
    setAdmin(a => ({ ...a, password: pwNew }))
    setPwNew('')
    setPwSuper('')
    pushToast && pushToast('Mot de passe admin mis à jour', 'KeyRound')
  }

  function setSchedule(updater: any) {
    setAdmin(a => ({ ...a, schedule: typeof updater === 'function' ? updater(a.schedule) : updater }))
  }

  function setInterruptions(updater: any) {
    setAdmin(a => ({ ...a, interruptions: typeof updater === 'function' ? updater(a.interruptions || []) : updater }))
  }

  const scheduledStartMs = schedule.startISO ? new Date(schedule.startISO).getTime() : null
  const scheduledEndMs = schedule.endISO ? new Date(schedule.endISO).getTime() : null
  const plannedDurationMs = scheduledStartMs && scheduledEndMs ? scheduledEndMs - scheduledStartMs : 24 * 3600 * 1000
  const tilStartMs = scheduledStartMs ? scheduledStartMs - now : null

  const activeRaceItr = interruptions.find((i: any) => i.kind === 'race' && !i.endMs)
  const activeAppItr = interruptions.find((i: any) => i.kind === 'app' && !i.endMs)

  function startItr(kind: string, reason: string) {
    const id = 'i' + Date.now().toString(36)
    setInterruptions((arr: any[]) => [
      ...(arr || []),
      { id, kind, reason: reason || (kind === 'race' ? 'Interruption course' : 'Incident technique'), startMs: Date.now(), endMs: null },
    ])
    if (kind === 'race' && race.started) {
      setAdmin(a => ({ ...a, race: { ...a.race, started: false } }))
    }
    pushToast && pushToast(kind === 'race' ? 'Course interrompue' : 'Service interrompu', 'AlertTriangle')
  }

  function endItr(id: string) {
    setInterruptions((arr: any[]) => (arr || []).map((i: any) => (i.id === id ? { ...i, endMs: Date.now() } : i)))
    const it = interruptions.find((i: any) => i.id === id)
    if (it?.kind === 'race' && race.startTime) {
      setAdmin(a => ({ ...a, race: { ...a.race, started: true } }))
    }
    pushToast && pushToast(it?.kind === 'race' ? 'Course reprise' : 'Service rétabli', 'Play')
  }

  function patchItr(id: string, patch: any) {
    setInterruptions((arr: any[]) => (arr || []).map((i: any) => (i.id === id ? { ...i, ...patch } : i)))
  }

  function removeItr(id: string) {
    setInterruptions((arr: any[]) => (arr || []).filter((i: any) => i.id !== id))
  }

  const totalRacePauseMs = interruptions
    .filter((i: any) => i.kind === 'race')
    .reduce((a: number, i: any) => a + ((i.endMs || now) - i.startMs), 0)
  const totalAppPauseMs = interruptions
    .filter((i: any) => i.kind === 'app')
    .reduce((a: number, i: any) => a + ((i.endMs || now) - i.startMs), 0)

  let raceStatus = 'scheduled'
  if (activeRaceItr) raceStatus = 'interrupted'
  else if (race.started) raceStatus = 'running'
  else if (race.startTime) raceStatus = 'paused'

  const teamsArr = Object.values(teamsById || {})
  const totalLaps = teamsArr.reduce((a, t) => a + (t.laps || []).length, 0)
  const readyTeamsCount = teamsArr.filter(t => t.info?.ready).length
  const contact = admin.contact || { email: '', phone: '' }

  function setContact(updater: any) {
    setAdmin(a => ({ ...a, contact: typeof updater === 'function' ? updater(a.contact || { email: '', phone: '' }) : updater }))
  }

  return (
    <div className="page">
      <TestModeBadge testMode={testMode} />
      <div className="grid" style={{ gridTemplateColumns: '1.2fr 1fr', gap: 18 }}>
        {/* LEFT — Schedule + control + interruptions */}
        <div className="grid" style={{ gap: 18, alignContent: 'start' }}>
          {/* Schedule */}
          <div className="card">
            <div className="card-head">
              <span>📅</span>
              <h3>Horaires de la course</h3>
              <span
                className={`badge ${raceStatus === 'running' ? 'accent' : raceStatus === 'interrupted' ? 'danger' : raceStatus === 'paused' ? 'warn' : ''}`}
                style={{ marginLeft: 'auto' }}
              >
                {raceStatus === 'running'
                  ? 'En course'
                  : raceStatus === 'interrupted'
                    ? 'Interrompue'
                    : raceStatus === 'paused'
                      ? 'En pause'
                      : 'Programmée'}
              </span>
            </div>
            <div className="card-body grid" style={{ gap: 14 }}>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <span className="field-label">Départ programmé</span>
                  <input
                    type="datetime-local"
                    value={schedule.startISO || ''}
                    onChange={e => setSchedule((s: any) => ({ ...s, startISO: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <span className="field-label">Arrivée programmée</span>
                  <input
                    type="datetime-local"
                    value={schedule.endISO || ''}
                    onChange={e => setSchedule((s: any) => ({ ...s, endISO: e.target.value }))}
                  />
                </div>
              </div>

              {scheduledStartMs && scheduledEndMs && (
                <div className="stat-row">
                  <div className="stat">
                    <div className="stat-label">Durée prévue</div>
                    <div className="stat-value mono">{fmtClock(plannedDurationMs)}</div>
                  </div>
                  <div className="stat">
                    <div className="stat-label">{tilStartMs! > 0 ? 'Avant départ' : 'Depuis départ prévu'}</div>
                    <div className="stat-value mono" style={{ color: tilStartMs! > 0 ? 'var(--text)' : 'var(--accent)' }}>
                      {tilStartMs! > 0 ? fmtClock(tilStartMs!) : '+' + fmtClock(-tilStartMs!)}
                    </div>
                  </div>
                </div>
              )}

              <hr className="sep" style={{ margin: 0 }} />

              <div className="grid" style={{ gap: 10 }}>
                <span className="field-label">Lancer la course (globale, toutes équipes)</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn primary" onClick={startRaceNow} disabled={race.started}>
                    🚀 Lancer maintenant
                  </button>
                  <button className="btn" onClick={startRaceAtScheduled} disabled={race.started || !scheduledStartMs}>
                    📅 Caler sur l'heure programmée
                  </button>
                  {race.started && (
                    <button className="btn danger" onClick={stopRace}>
                      ⏹ Stopper
                    </button>
                  )}
                  {(race.startTime || totalLaps > 0) && resetRace && (
                    <button className="btn ghost" onClick={resetRace} title="Effacer le départ, les tours et les interruptions">
                      🔄 Réinitialiser la course
                    </button>
                  )}
                </div>
                {!race.started && (
                  <div
                    className="hint"
                    style={{
                      marginTop: 4,
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: 'var(--bg-2)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span>🏁</span>
                    <span>
                      <span
                        className="mono"
                        style={{
                          color: readyTeamsCount === teamsArr.length && teamsArr.length > 0 ? 'var(--accent)' : 'var(--text)',
                          fontWeight: 600,
                        }}
                      >
                        {readyTeamsCount}
                      </span>
                      {' / '}<span className="mono">{teamsArr.length}</span> équipe{teamsArr.length > 1 ? 's' : ''} prête
                      {readyTeamsCount > 1 ? 's' : ''} au départ
                    </span>
                  </div>
                )}

                {race.startTime && (
                  <div className="card" style={{ background: 'var(--bg-2)', padding: 12, marginTop: 4 }}>
                    <div className="field-label" style={{ marginBottom: 6 }}>
                      Heure de départ effective{' '}
                      <span style={{ color: 'var(--muted)', textTransform: 'none', letterSpacing: 0 }}>· modifiable si oubli</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="datetime-local"
                        defaultValue={toLocalDatetime(race.startTime)}
                        onBlur={e => correctActualStart(e.target.value)}
                        style={{ flex: '1 1 200px' }}
                      />
                      <button
                        className="btn ghost"
                        onClick={() => correctActualStart(toLocalDatetime(scheduledStartMs))}
                        disabled={!scheduledStartMs}
                      >
                        📅 Recaler sur prévu
                      </button>
                    </div>
                    <div className="hint" style={{ marginTop: 6 }}>
                      Si vous avez oublié de cliquer "Lancer", saisissez ici l'heure réelle où la course a commencé.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Interruptions */}
          <div className="card">
            <div className="card-head">
              <span>⚠️</span>
              <h3>Interruptions</h3>
              <span className="hint" style={{ marginLeft: 'auto' }}>
                Cumul course <span className="mono" style={{ color: 'var(--text)' }}>{fmtClock(totalRacePauseMs)}</span>
                {' · '}service <span className="mono" style={{ color: 'var(--text)' }}>{fmtClock(totalAppPauseMs)}</span>
              </span>
            </div>
            <div className="card-body grid" style={{ gap: 12 }}>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {/* Race interruption */}
                <div
                  className="card"
                  style={{
                    background: activeRaceItr ? 'oklch(0.72 0.21 25 / 0.08)' : 'var(--bg-2)',
                    padding: 12,
                    border: '1px solid ' + (activeRaceItr ? 'oklch(0.72 0.21 25 / 0.4)' : 'var(--border)'),
                  }}
                >
                  <div className="field-label" style={{ marginBottom: 6 }}>🏁 Course</div>
                  {activeRaceItr ? (
                    <>
                      <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, marginBottom: 4 }}>{activeRaceItr.reason}</div>
                      <div className="hint mono" style={{ marginBottom: 8 }}>
                        Depuis {fmtTime(activeRaceItr.startMs)} · {fmtClock(now - activeRaceItr.startMs)}
                      </div>
                      <button className="btn primary" onClick={() => endItr(activeRaceItr.id)}>
                        ▶ Reprendre la course
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="hint" style={{ marginBottom: 8 }}>
                        Drapeau rouge / accident / météo. Met la course en pause.
                      </div>
                      <button
                        className="btn danger"
                        onClick={() => {
                          const reason = prompt("Motif de l'interruption ?", 'Drapeau rouge')
                          if (reason) startItr('race', reason)
                        }}
                        disabled={!race.startTime}
                      >
                        ⏸ Interrompre la course
                      </button>
                    </>
                  )}
                </div>

                {/* App interruption */}
                <div
                  className="card"
                  style={{
                    background: activeAppItr ? 'oklch(0.78 0.18 80 / 0.08)' : 'var(--bg-2)',
                    padding: 12,
                    border: '1px solid ' + (activeAppItr ? 'oklch(0.78 0.18 80 / 0.4)' : 'var(--border)'),
                  }}
                >
                  <div className="field-label" style={{ marginBottom: 6 }}>📶 Service applicatif</div>
                  {activeAppItr ? (
                    <>
                      <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, marginBottom: 4 }}>{activeAppItr.reason}</div>
                      <div className="hint mono" style={{ marginBottom: 8 }}>
                        Depuis {fmtTime(activeAppItr.startMs)} · {fmtClock(now - activeAppItr.startMs)}
                      </div>
                      <button className="btn primary" onClick={() => endItr(activeAppItr.id)}>
                        ▶ Service rétabli
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="hint" style={{ marginBottom: 8 }}>
                        Bug, perte réseau, batterie. La course continue mais les saisies sont à recaler.
                      </div>
                      <button
                        className="btn"
                        style={{ background: 'oklch(0.78 0.18 80 / 0.15)', color: 'oklch(0.86 0.18 80)' }}
                        onClick={() => {
                          const reason = prompt("Type d'incident ?", 'Perte réseau')
                          if (reason) startItr('app', reason)
                        }}
                      >
                        📵 Signaler un incident
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Interruption log */}
              {interruptions.length > 0 && (
                <div>
                  <div className="field-label" style={{ marginBottom: 6 }}>
                    Journal · {interruptions.length} entrée{interruptions.length > 1 ? 's' : ''}
                  </div>
                  <div className="grid" style={{ gap: 4 }}>
                    {interruptions
                      .slice()
                      .reverse()
                      .map((it: any) => {
                        const dur = (it.endMs || now) - it.startMs
                        const ongoing = !it.endMs
                        return (
                          <div
                            key={it.id}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '70px 1fr 110px 110px 90px 28px',
                              gap: 8,
                              alignItems: 'center',
                              padding: '6px 8px',
                              borderRadius: 6,
                              background: ongoing
                                ? it.kind === 'race'
                                  ? 'oklch(0.72 0.21 25 / 0.06)'
                                  : 'oklch(0.78 0.18 80 / 0.06)'
                                : 'var(--bg-2)',
                              border: '1px solid ' + (ongoing
                                ? it.kind === 'race'
                                  ? 'oklch(0.72 0.21 25 / 0.3)'
                                  : 'oklch(0.78 0.18 80 / 0.3)'
                                : 'var(--border)'),
                              fontSize: 12,
                            }}
                          >
                            <span
                              className="badge"
                              style={{
                                background: it.kind === 'race' ? 'oklch(0.72 0.21 25 / 0.15)' : 'oklch(0.78 0.18 80 / 0.15)',
                                color: it.kind === 'race' ? 'oklch(0.85 0.16 25)' : 'oklch(0.88 0.15 80)',
                                fontSize: 10,
                                padding: '2px 6px',
                              }}
                            >
                              {it.kind === 'race' ? 'COURSE' : 'SERVICE'}
                            </span>
                            <input
                              value={it.reason}
                              onChange={e => patchItr(it.id, { reason: e.target.value })}
                              style={{ background: 'transparent', border: 'none', padding: 2, fontSize: 12, color: 'var(--text)' }}
                            />
                            <input
                              type="datetime-local"
                              value={toLocalDatetime(it.startMs)}
                              onChange={e => {
                                const t = new Date(e.target.value).getTime()
                                if (!isNaN(t)) patchItr(it.id, { startMs: t })
                              }}
                              style={{ padding: '2px 4px', fontSize: 11 }}
                              className="mono"
                            />
                            <input
                              type="datetime-local"
                              value={it.endMs ? toLocalDatetime(it.endMs) : ''}
                              placeholder="—"
                              onChange={e => {
                                const t = e.target.value ? new Date(e.target.value).getTime() : null
                                patchItr(it.id, { endMs: t })
                              }}
                              style={{ padding: '2px 4px', fontSize: 11, opacity: ongoing ? 0.5 : 1 }}
                              className="mono"
                            />
                            <span
                              className="mono"
                              style={{
                                color: ongoing
                                  ? it.kind === 'race'
                                    ? 'oklch(0.85 0.16 25)'
                                    : 'oklch(0.88 0.15 80)'
                                  : 'var(--text-2)',
                                fontWeight: 600,
                                textAlign: 'right',
                              }}
                            >
                              {ongoing ? '● ' : ''}
                              {fmtClock(dur)}
                            </span>
                            <button className="btn ghost icon" onClick={() => removeItr(it.id)} title="Supprimer">
                              🗑
                            </button>
                          </div>
                        )
                      })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Summary */}
          <div className="card">
            <div className="card-head">
              <span>📊</span>
              <h3>Récapitulatif</h3>
            </div>
            <div className="card-body">
              <div className="stat-row">
                <div className="stat">
                  <div className="stat-label">Équipes</div>
                  <div className="stat-value mono">{teamsArr.length}</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Coureurs totaux</div>
                  <div className="stat-value mono">{teamsArr.reduce((a, t) => a + (t.runners || []).length, 0)}</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Tours validés</div>
                  <div className="stat-value mono">{totalLaps}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Replace auto window — acceptance time for manual click overriding auto lap */}
          <div className="card">
            <div className="card-head">
              <span>⏱️</span>
              <h3>Fenêtre d'acceptation manuelle</h3>
            </div>
            <div className="card-body grid" style={{ gap: 10 }}>
              <div className="hint">
                Délai (en secondes) pendant lequel un click sur Passage / Relai côté équipe REMPLACE l'éventuel passage auto enregistré juste avant.
                <br />Recommandé : <strong className="mono">10s</strong> en test, <strong className="mono">180s</strong> en course.
              </div>
              <div className="field" style={{ maxWidth: 220 }}>
                <span className="field-label">Délai (secondes)</span>
                <input
                  type="number"
                  min="0"
                  max="600"
                  className="mono"
                  value={(admin as any).replaceAutoWindowSec ?? 180}
                  onChange={e => setAdmin((a: any) => ({ ...a, replaceAutoWindowSec: Math.max(0, +e.target.value || 0) }))}
                  style={{ textAlign: 'center' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn"
                  onClick={() => setAdmin((a: any) => ({ ...a, replaceAutoWindowSec: 10 }))}
                  title="Préréglage tests"
                >
                  10s · tests
                </button>
                <button
                  className="btn"
                  onClick={() => setAdmin((a: any) => ({ ...a, replaceAutoWindowSec: 180 }))}
                  title="Préréglage course"
                >
                  180s · course
                </button>
              </div>
              <hr className="sep" style={{ margin: '4px 0' }} />
              <div className="hint">
                Bornes physiques temps au tour (sec). Permet d'autoriser des tours plus courts en local pour tests.
              </div>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="field">
                  <span className="field-label">Min temps tour (sec)</span>
                  <input
                    type="number"
                    min="1"
                    max="600"
                    className="mono"
                    value={(admin as any).minLapSec ?? 165}
                    onChange={e => setAdmin((a: any) => ({ ...a, minLapSec: Math.max(1, +e.target.value || 1) }))}
                    style={{ textAlign: 'center' }}
                  />
                </div>
                <div className="field">
                  <span className="field-label">Max temps tour (sec)</span>
                  <input
                    type="number"
                    min="1"
                    max="3600"
                    className="mono"
                    value={(admin as any).maxLapSec ?? 480}
                    onChange={e => setAdmin((a: any) => ({ ...a, maxLapSec: Math.max(1, +e.target.value || 1) }))}
                    style={{ textAlign: 'center' }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn"
                  onClick={() => setAdmin((a: any) => ({ ...a, minLapSec: 5, maxLapSec: 600 }))}
                  title="Préréglage tests permissifs"
                >
                  5..600s · tests
                </button>
                <button
                  className="btn"
                  onClick={() => setAdmin((a: any) => ({ ...a, minLapSec: 165, maxLapSec: 480 }))}
                  title="Préréglage course"
                >
                  165..480s · course
                </button>
              </div>
              <hr className="sep" style={{ margin: '4px 0' }} />
              <div className="hint">
                Nombre max de coureurs par équipe (uniforme pour toutes les équipes de l'event). Les coureurs en abandon ne comptent pas.
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <div className="field" style={{ maxWidth: 220 }}>
                  <span className="field-label">Max coureurs / équipe</span>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    className="mono"
                    defaultValue={evMaxRunners}
                    onBlur={async (e) => {
                      const v = Math.max(1, Math.min(50, +e.target.value || 1))
                      if (v === evMaxRunners) return
                      try {
                        await onSetMaxRunnersPerTeam?.(v)
                        pushToast(`Max coureurs/équipe → ${v}`, 'Check')
                      } catch (err: any) {
                        // ConvexError data carries human-readable .message; fallback to native message string
                        const msg = err?.data?.message || err?.message || 'Erreur capacité'
                        pushToast(msg, 'AlertTriangle')
                        e.target.value = String(evMaxRunners)
                      }
                    }}
                    style={{ textAlign: 'center' }}
                  />
                </div>
                <div className="field" style={{ maxWidth: 220 }}>
                  <span className="field-label">Transition relai (sec)</span>
                  <input
                    type="number"
                    min="0"
                    max="60"
                    className="mono"
                    defaultValue={evRelayTransition}
                    title="Pénalité de temps ajoutée au tour qui suit un relai (handover entre coureurs)"
                    onBlur={async (e) => {
                      const v = Math.max(0, Math.min(60, Math.round(+e.target.value || 0)))
                      if (v === evRelayTransition) return
                      try {
                        await onSetRelayTransitionSec?.(v)
                        pushToast(`Transition relai → ${v}s`, 'Check')
                      } catch (err: any) {
                        const msg = err?.data?.message || err?.message || 'Erreur'
                        pushToast(msg, 'AlertTriangle')
                        e.target.value = String(evRelayTransition)
                      }
                    }}
                    style={{ textAlign: 'center' }}
                  />
                </div>
              </div>
              <hr className="sep" style={{ margin: '4px 0' }} />
              <div className="hint">
                Mode test : active des timings raccourcis (5s minLap, 30s maxLap, 3s replaceAuto, 2s relayTransition) pour tester la logique cron auto-pass + relai en quelques secondes. Verrouillé une fois la course démarrée ou à moins de 10 min du départ.
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: testModeLocked ? 'not-allowed' : 'pointer',
                    opacity: testModeLocked ? 0.5 : 1,
                  }}
                  title={testModeLocked ? testModeLockReason || 'Verrouillé' : 'Activer/désactiver le mode test'}
                >
                  <input
                    type="checkbox"
                    checked={!!testMode}
                    disabled={testModeLocked}
                    onChange={async (e) => {
                      const next = e.target.checked
                      try {
                        await onSetTestMode?.(next)
                        pushToast(next ? 'Mode test activé ⚠' : 'Mode test désactivé', 'Check')
                      } catch (err: any) {
                        const msg = err?.data?.message || err?.message || 'Erreur'
                        pushToast(msg, 'AlertTriangle')
                        e.target.checked = !next
                      }
                    }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>Mode test (timings raccourcis)</span>
                  {testMode && (
                    <span
                      className="badge"
                      style={{
                        fontSize: 10,
                        padding: '2px 6px',
                        background: 'oklch(0.72 0.21 25 / 0.18)',
                        color: 'oklch(0.85 0.18 25)',
                        border: '1px solid oklch(0.72 0.21 25 / 0.5)',
                      }}
                    >
                      ACTIF
                    </span>
                  )}
                </label>
                {testModeLocked && (
                  <span className="hint" style={{ fontSize: 11, color: 'var(--muted)' }}>
                    🔒 {testModeLockReason}
                  </span>
                )}
              </div>
              <hr className="sep" style={{ margin: '4px 0' }} />
              <div className="hint">
                Géolocalisation event (ville + lat/lng). Active la météo horaire dans le planning des passages (Met.no). Vide → météo masquée.
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div className="field" style={{ flex: '1 1 200px', maxWidth: 280 }}>
                  <span className="field-label">Ville (affichée)</span>
                  <input
                    type="text"
                    defaultValue={cityName ?? ''}
                    placeholder="Brette les Pins"
                    maxLength={60}
                    onBlur={async (e) => {
                      const raw = e.target.value.trim()
                      if (raw === (cityName ?? '')) return
                      try {
                        await onSetLatLng?.(latitude ?? null, longitude ?? null, raw || null)
                        pushToast(raw ? `Ville → ${raw}` : 'Ville effacée', 'Check')
                      } catch (err: any) {
                        const msg = err?.data?.message || err?.message || 'Erreur'
                        pushToast(msg, 'AlertTriangle')
                      }
                    }}
                  />
                </div>
                <div className="field" style={{ maxWidth: 160 }}>
                  <span className="field-label">Latitude</span>
                  <input
                    type="number"
                    step="any"
                    min="-90"
                    max="90"
                    className="mono"
                    defaultValue={latitude ?? ''}
                    placeholder="47.7547"
                    onBlur={async (e) => {
                      const raw = e.target.value.trim()
                      const lat = raw === '' ? null : Number(raw)
                      if (lat !== null && (Number.isNaN(lat) || lat < -90 || lat > 90)) {
                        pushToast('Latitude invalide (-90..90)', 'AlertTriangle')
                        e.target.value = latitude != null ? String(latitude) : ''
                        return
                      }
                      try {
                        await onSetLatLng?.(lat, longitude ?? null, cityName ?? null)
                        pushToast('Latitude enregistrée', 'Check')
                      } catch (err: any) {
                        const msg = err?.data?.message || err?.message || 'Erreur'
                        pushToast(msg, 'AlertTriangle')
                      }
                    }}
                    style={{ textAlign: 'center' }}
                  />
                </div>
                <div className="field" style={{ maxWidth: 160 }}>
                  <span className="field-label">Longitude</span>
                  <input
                    type="number"
                    step="any"
                    min="-180"
                    max="180"
                    className="mono"
                    defaultValue={longitude ?? ''}
                    placeholder="0.3247"
                    onBlur={async (e) => {
                      const raw = e.target.value.trim()
                      const lng = raw === '' ? null : Number(raw)
                      if (lng !== null && (Number.isNaN(lng) || lng < -180 || lng > 180)) {
                        pushToast('Longitude invalide (-180..180)', 'AlertTriangle')
                        e.target.value = longitude != null ? String(longitude) : ''
                        return
                      }
                      try {
                        await onSetLatLng?.(latitude ?? null, lng, cityName ?? null)
                        pushToast('Longitude enregistrée', 'Check')
                      } catch (err: any) {
                        const msg = err?.data?.message || err?.message || 'Erreur'
                        pushToast(msg, 'AlertTriangle')
                      }
                    }}
                    style={{ textAlign: 'center' }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Contact */}
          <div className="card">
            <div className="card-head">
              <span>📞</span>
              <h3>Contact administrateur</h3>
            </div>
            <div className="card-body grid" style={{ gap: 10 }}>
              <div className="hint">Affiché aux équipes en cas de question / problème pendant la course.</div>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="field">
                  <span className="field-label">Email</span>
                  <input
                    type="email"
                    value={contact.email || ''}
                    onChange={e => setContact((c: any) => ({ ...c, email: e.target.value }))}
                    placeholder="admin@example.com"
                    autoComplete="off"
                  />
                </div>
                <div className="field">
                  <span className="field-label">Téléphone (optionnel)</span>
                  <input
                    type="tel"
                    value={contact.phone || ''}
                    onChange={e => setContact((c: any) => ({ ...c, phone: e.target.value }))}
                    placeholder="+33 6 12 34 56 78"
                    autoComplete="off"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Password change */}
          <div className="card">
            <div className="card-head">
              <span>🔑</span>
              <h3>Mot de passe administrateur</h3>
            </div>
            <div className="card-body grid" style={{ gap: 12 }}>
              <div className="hint">
                Mot de passe partagé entre plusieurs admins. Le changement requiert le PIN super-admin.
              </div>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="field">
                  <span className="field-label">Nouveau mot de passe admin</span>
                  <input
                    type="text"
                    value={pwNew}
                    onChange={e => setPwNew(e.target.value)}
                    placeholder="nouveau mot de passe"
                    autoComplete="off"
                  />
                </div>
                <div className="field">
                  <span className="field-label">PIN super-admin</span>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={8}
                    value={pwSuper}
                    onChange={e => setPwSuper(e.target.value.replace(/\D/g, ''))}
                    className="mono"
                    style={{ letterSpacing: '0.3em', textAlign: 'center' }}
                    placeholder="••••••"
                    autoComplete="off"
                  />
                </div>
              </div>
              {pwErr && <div className="hint" style={{ color: 'var(--danger)' }}>{pwErr}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn primary" onClick={submitPasswordChange} disabled={!pwNew || !pwSuper}>
                  🔑 Changer le mot de passe
                </button>
                {pwNew || pwSuper ? (
                  <button
                    className="btn ghost"
                    onClick={() => {
                      setPwNew('')
                      setPwSuper('')
                      setPwErr('')
                    }}
                  >
                    Annuler
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT — Teams CRUD */}
        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="card-head">
            <span>👥</span>
            <h3>Équipes · {teamsArr.length}</h3>
            <button className="btn primary" style={{ marginLeft: 'auto' }} onClick={addTeam}>
              ➕ Ajouter une équipe
            </button>
          </div>
          <div className="card-body">
            {teamsArr.length === 0 && <div className="empty">Aucune équipe. Ajoute la première.</div>}
            <div className="grid" style={{ gap: 10 }}>
              {teamsArr.map((t, i) => (
                <div
                  key={t.info.id}
                  className="card"
                  style={{
                    background: 'var(--bg-2)',
                    padding: 12,
                    borderRadius: 12,
                    borderLeft: `4px solid ${t.info.color || 'var(--accent)'}`,
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '32px 32px 1fr auto 36px 36px', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                    <span className="mono" style={{ color: 'var(--muted)' }}>{String(i + 1).padStart(2, '0')}</span>
                    <input
                      type="color"
                      value={t.info.color || '#A6F060'}
                      onChange={e => updateTeamInfo(t.info.id, { color: e.target.value })}
                      title="Couleur de l'équipe"
                      style={{
                        width: 28,
                        height: 28,
                        padding: 0,
                        background: t.info.color,
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 6,
                        cursor: 'pointer',
                      }}
                    />
                    <input
                      value={t.info.name}
                      onChange={e => updateTeamInfo(t.info.id, { name: e.target.value })}
                      placeholder="Nom de l'équipe"
                      style={{ fontSize: 15, fontWeight: 500 }}
                    />
                    {!race.started && (
                      <button
                        onClick={() => updateTeamInfo(t.info.id, { ready: !t.info.ready })}
                        title={t.info.ready ? "Marquer non-prête" : "Marquer prête au départ"}
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          padding: '6px 12px',
                          borderRadius: 999,
                          cursor: 'pointer',
                          background: t.info.ready ? 'oklch(0.86 0.20 135)' : 'var(--bg-2)',
                          color: t.info.ready ? '#0a0e0c' : 'var(--text-2)',
                          border: '1px solid ' + (t.info.ready ? 'oklch(0.86 0.20 135)' : 'var(--border)'),
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {t.info.ready ? '✓ Prête' : 'Marquer prête'}
                      </button>
                    )}
                    {race.started && (
                      <span
                        className="badge"
                        style={{
                          fontSize: 10,
                          background: t.info.ready ? 'oklch(0.86 0.20 135 / 0.18)' : 'var(--bg-2)',
                          color: t.info.ready ? 'oklch(0.92 0.20 135)' : 'var(--muted)',
                        }}
                      >
                        {t.info.ready ? '✓ Prête' : 'Non prête'}
                      </span>
                    )}
                    <button
                      className="btn ghost icon"
                      onClick={() => navigate({ to: '/team/$teamId', params: { teamId: t.info.id }, search: { tab: 'live', readonly: true } as any })}
                      title="Voir l'équipe en lecture seule"
                    >
                      👁️
                    </button>
                    <button className="btn ghost icon" onClick={() => removeTeam(t.info.id)} title="Supprimer">
                      🗑
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <div className="field">
                      <span className="field-label">Catégorie</span>
                      <select value={t.info.category || 'Mixte'} onChange={e => updateTeamInfo(t.info.id, { category: e.target.value })}>
                        {TEAM_CATEGORIES.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <span className="field-label">Objectif tours (auto)</span>
                      <div
                        className="mono"
                        style={{
                          padding: '9px 10px',
                          background: 'var(--bg-2)',
                          border: '1px solid var(--border)',
                          borderRadius: 10,
                          fontSize: 14,
                          color: 'var(--text-2)',
                        }}
                        title="Calculé automatiquement avant le départ depuis l'allure × plannedLaps des coureurs. Verrouillé au top départ."
                      >
                        {t.info.goalLaps || '—'}
                      </div>
                    </div>
                    <div className="field">
                      <span className="field-label">PIN équipe</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={8}
                        className="mono"
                        value={t.info.pin || ''}
                        onChange={e => updateTeamInfo(t.info.id, { pin: e.target.value.replace(/\D/g, '') })}
                        style={{ letterSpacing: '0.2em', textAlign: 'center' }}
                        placeholder="0000"
                      />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                    <div className="field">
                      <span className="field-label">Référent équipe (optionnel)</span>
                      <input
                        type="text"
                        value={t.info.contactName || ''}
                        onChange={e => updateTeamInfo(t.info.id, { contactName: e.target.value })}
                        placeholder="Prénom Nom"
                        autoComplete="off"
                      />
                    </div>
                    <div className="field">
                      <span className="field-label">Téléphone référent (optionnel)</span>
                      <input
                        type="tel"
                        value={t.info.contactPhone || ''}
                        onChange={e => updateTeamInfo(t.info.id, { contactPhone: e.target.value })}
                        placeholder="+33 6 12 34 56 78"
                        autoComplete="off"
                      />
                    </div>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <span className="field-label">Image de profil (optionnel)</span>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
                      {t.info.profileImage ? (
                        <img
                          src={t.info.profileImage}
                          alt={t.info.name}
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 10,
                            objectFit: 'cover',
                            border: '1px solid var(--border)',
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 10,
                            background: t.info.color || 'var(--accent)',
                            color: '#0a0e0c',
                            display: 'grid',
                            placeItems: 'center',
                            fontWeight: 700,
                            fontSize: 18,
                            border: '1px solid var(--border)',
                          }}
                          className="mono"
                        >
                          {t.info.name ? t.info.name.charAt(0).toUpperCase() : '?'}
                        </div>
                      )}
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
                                updateTeamInfo(t.info.id, { profileImage: result })
                              }
                              reader.readAsDataURL(file)
                            }
                          }}
                          style={{ fontSize: 12 }}
                        />
                        {t.info.profileImage && (
                          <button
                            onClick={() => updateTeamInfo(t.info.id, { profileImage: undefined })}
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
                  <div className="hint" style={{ marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span>{((t.runners || []).filter((r: any) => r.status !== 'out')).length} / {evMaxRunners} actifs</span>
                    <span>{(t.laps || []).length} tour(s) validés</span>
                    {t.info.contactName && (
                      <span>
                        · réf. {t.info.contactName}
                        {t.info.contactPhone ? ` · ${t.info.contactPhone}` : ''}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}