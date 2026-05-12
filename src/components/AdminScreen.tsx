import React, { useEffect, useState } from 'react';
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
  maxRunners: number
  pin: string
  category: string
  goalLaps: number
  color: string
  ready?: boolean
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
  onLock: () => void
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
  onLock,
}: AdminScreenProps) {
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
                  <div style={{ display: 'grid', gridTemplateColumns: '32px 32px 1fr 36px', gap: 10, alignItems: 'center', marginBottom: 10 }}>
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
                    <button className="btn ghost icon" onClick={() => removeTeam(t.info.id)} title="Supprimer">
                      🗑
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                    <div className="field">
                      <span className="field-label">Catégorie</span>
                      <select value={t.info.category || 'Mixte'} onChange={e => updateTeamInfo(t.info.id, { category: e.target.value })}>
                        {TEAM_CATEGORIES.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <span className="field-label">Max coureurs</span>
                      <input
                        type="number"
                        min="1"
                        max="30"
                        className="mono"
                        value={t.info.maxRunners || 6}
                        onChange={e => updateTeamInfo(t.info.id, { maxRunners: Math.max(1, +e.target.value || 1) })}
                      />
                    </div>
                    <div className="field">
                      <span className="field-label">Objectif tours</span>
                      <input
                        type="number"
                        min="1"
                        className="mono"
                        value={t.info.goalLaps || 200}
                        onChange={e => updateTeamInfo(t.info.id, { goalLaps: Math.max(1, +e.target.value || 1) })}
                      />
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
                  <div className="hint" style={{ marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span>{(t.runners || []).length} / {t.info.maxRunners || 6} coureur(s)</span>
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