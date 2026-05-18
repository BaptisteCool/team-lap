import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { AdminScreen } from '../components/AdminScreen'
import { PinGate } from '../components/PinGate'
import { useAction, useMutation, useQuery } from '../convex/hooks'
import { DEFAULT_ADMIN_PASSWORD, defaultAdminState, emptyTeamSlice, TEAM_COLOR_PALETTE, toLocalDatetime } from '../lib/race-data'

export const Route = createFileRoute('/admin')({
  component: AdminPage,
})

function AdminPage() {
  const navigate = useNavigate()
  const [unlocked, setUnlocked] = useState(false)
  const [admin, setAdmin] = useState(defaultAdminState())
  const [teamsById, setTeamsById] = useState<Record<string, any>>({})
  
  // Get event from Convex
  const event = useQuery('events:getBySlug' as any, { slug: '24h-brette-les-pins-2026' })
  
  // Get teams from Convex
  const teams = useQuery('teams:getTeams' as any, event?._id ? { eventId: event._id } : 'skip')
  
  // Interruptions from Convex
  const interruptions = useQuery(
    'events:getInterruptions' as any,
    event?._id ? { eventId: event._id } : 'skip',
  ) as any[] | null | undefined

  // Mutations
  const createTeamMutation = useMutation('teams:createTeam' as any)
  const updateTeamMutation = useMutation('teams:updateTeam' as any)
  const deleteTeamMutation = useMutation('teams:deleteTeam' as any)
  const startRaceNowMutation = useMutation('events:startRaceNow' as any)
  const startRaceAtScheduledMutation = useMutation('events:startRaceAtScheduled' as any)
  const stopRaceMutation = useMutation('events:stopRace' as any)
  const correctActualStartMutation = useMutation('events:correctActualStart' as any)
  const resetRaceMutation = useMutation('events:resetRace' as any)
  const setScheduleMutation = useMutation('events:setSchedule' as any)
  const updateContactMutation = useMutation('events:updateContact' as any)
  const updatePasswordMutation = useMutation('events:updateAdminPassword' as any)
  const updateReplaceAutoWindowMutation = useMutation('events:updateReplaceAutoWindow' as any)
  const setFirstLapDistanceMutation = useMutation('events:setFirstLapDistance' as any)
  const setTestModeDividerMutation = useMutation('events:setTestModeDivider' as any)
  const setMaxRunnersPerTeamMutation = useMutation('events:setMaxRunnersPerTeam' as any)
  const setLatLngMutation = useMutation('events:setLatLng' as any)
  const setRelayTransitionSecMutation = useMutation('events:setRelayTransitionSec' as any)
  const setChronoplaceEventIdMutation = useMutation('events:setChronoplaceEventId' as any)
  const setChronoplaceClassementUrlMutation = useMutation('events:setChronoplaceClassementUrl' as any)
  const setOrganizerUrlMutation = useMutation('events:setOrganizerUrl' as any)
  const setChronoplaceSlugMutation = useMutation('teams:setChronoplaceSlug' as any)
  const setChronoplaceResultsUrlMutation = useMutation('teams:setChronoplaceResultsUrl' as any)
  const setDossardMutation = useMutation('teams:setDossard' as any)
  const setChronoSyncEnabledMutation = useMutation('teams:setChronoSyncEnabled' as any)
  const forceChronoSyncAction = useAction('chronoplace:forceSyncTeam' as any)
  const dispatchChronoSyncAction = useAction('chronoplace:dispatchSync' as any)
  const presenceBeatMutation = useMutation('presence:beat' as any)
  const presenceLeaveMutation = useMutation('presence:leave' as any)

  // Presence heartbeat: tells the server "there is at least one viewer for this event"
  // so the Chronoplace auto-burst chain stays alive. When the last viewer leaves, the
  // chain naturally dies and stops consuming Convex compute.
  useEffect(() => {
    if (!event?._id) return
    const sessionId = (() => {
      try {
        const k = 'teamlap.presence.sessionId'
        let v = sessionStorage.getItem(k)
        if (!v) {
          v = (crypto as any)?.randomUUID
            ? crypto.randomUUID()
            : 's_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
          sessionStorage.setItem(k, v)
        }
        return v
      } catch (_) {
        return 's_fallback_' + Math.random().toString(36).slice(2)
      }
    })()
    let cancelled = false
    const tick = () => {
      if (cancelled) return
      presenceBeatMutation({ eventId: event._id, sessionId, context: 'admin' }).catch(
        (err: any) => console.warn('presence beat failed', err),
      )
    }
    tick()
    const id = setInterval(tick, 30_000)
    return () => {
      cancelled = true
      clearInterval(id)
      presenceLeaveMutation({ eventId: event._id, sessionId }).catch(() => {})
    }
  }, [event?._id])
  const setTestModeMutation = useMutation('events:setTestMode' as any)
  const endRaceMutation = useMutation('events:endRace' as any)
  const startItrMutation = useMutation('events:startInterruption' as any)
  const endItrMutation = useMutation('events:endInterruption' as any)
  const updateItrMutation = useMutation('events:updateInterruption' as any)
  const deleteItrMutation = useMutation('events:deleteInterruption' as any)

  // Chronoplace safety-net: poll dispatchSync every 30s while admin screen is open.
  // Server-side burst chain is the primary sync; this is a backstop.
  useEffect(() => {
    if (!event?._id) return
    if (event.status !== 'running') return
    let cancelled = false
    const tick = () => {
      if (cancelled) return
      dispatchChronoSyncAction({}).catch((err: any) =>
        console.warn('chronoplace dispatchSync failed', err),
      )
    }
    tick()
    const id = setInterval(tick, 30_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [event?._id, event?.status])

  // Sync event from Convex → admin local state
  useEffect(() => {
    if (!event) return
    setAdmin((a: any) => ({
      ...a,
      schedule: {
        startISO: event.scheduledStart ? toLocalDatetime(event.scheduledStart) : '',
        endISO: event.scheduledEnd ? toLocalDatetime(event.scheduledEnd) : '',
      },
      race: {
        started: event.status === 'running',
        startTime: event.actualStart || null,
      },
      contact: { email: event.contact?.email || '', phone: event.contact?.phone || '' },
      password: event.adminPassword || a.password,
      replaceAutoWindowSec: event.replaceAutoWindowSec ?? 180,
      firstLapDistanceM: (event as any).firstLapDistanceM ?? event.lapDistance ?? 900,
      testModeDivider: (event as any).testModeDivider ?? 3,
    }))
  }, [event])

  // Sync interruptions from Convex
  useEffect(() => {
    if (!interruptions) return
    setAdmin((a: any) => ({
      ...a,
      interruptions: interruptions.map((it: any) => ({
        id: it._id,
        kind: it.kind,
        reason: it.reason,
        startMs: it.startMs,
        endMs: it.endMs ?? null,
      })),
    }))
  }, [interruptions])

  // Wrap setAdmin: detect schedule / contact / password / interruption changes → persist
  const setAdminPersist: typeof setAdmin = (updater) => {
    setAdmin((prev: any) => {
      const next = typeof updater === 'function' ? (updater as any)(prev) : updater
      if (!event?._id) return next
      // Schedule
      const prevSchedule = prev.schedule || {}
      const nextSchedule = next.schedule || {}
      if (prevSchedule.startISO !== nextSchedule.startISO || prevSchedule.endISO !== nextSchedule.endISO) {
        const startMs = nextSchedule.startISO ? new Date(nextSchedule.startISO).getTime() : undefined
        const endMs = nextSchedule.endISO ? new Date(nextSchedule.endISO).getTime() : undefined
        setScheduleMutation({ eventId: event._id, scheduledStart: startMs, scheduledEnd: endMs }).catch(console.error)
      }
      // Contact
      const prevContact = prev.contact || {}
      const nextContact = next.contact || {}
      if (prevContact.email !== nextContact.email || prevContact.phone !== nextContact.phone) {
        updateContactMutation({ eventId: event._id, email: nextContact.email || undefined, phone: nextContact.phone || undefined }).catch(console.error)
      }
      // Password
      if (prev.password !== next.password) {
        updatePasswordMutation({ eventId: event._id, password: next.password }).catch(console.error)
      }
      // Replace auto window (manual click acceptance)
      if (prev.replaceAutoWindowSec !== next.replaceAutoWindowSec && next.replaceAutoWindowSec != null) {
        updateReplaceAutoWindowMutation({ eventId: event._id, seconds: next.replaceAutoWindowSec }).catch(console.error)
      }
      // First-lap distance (meters): only the very first lap of the race uses this.
      if (prev.firstLapDistanceM !== next.firstLapDistanceM && next.firstLapDistanceM != null) {
        setFirstLapDistanceMutation({
          eventId: event._id,
          meters: next.firstLapDistanceM,
        }).catch(console.error)
      }
      // Test mode divider (>=1): divides every time-related value when testMode is on.
      if (prev.testModeDivider !== next.testModeDivider && next.testModeDivider != null) {
        setTestModeDividerMutation({
          eventId: event._id,
          divider: next.testModeDivider,
        }).catch(console.error)
      }
      // Interruptions: detect adds/edits/deletes
      const prevItr: any[] = prev.interruptions || []
      const nextItr: any[] = next.interruptions || []
      const prevIds = new Set(prevItr.map((i: any) => i.id))
      const nextIds = new Set(nextItr.map((i: any) => i.id))
      // Adds: items in nextItr whose id starts with 'i' (local id) and not in prevIds
      for (const it of nextItr) {
        if (typeof it.id === 'string' && it.id.startsWith('i') && !prevIds.has(it.id)) {
          startItrMutation({ eventId: event._id, kind: it.kind, reason: it.reason }).catch(console.error)
        }
      }
      // Edits / endings: same id in prev/next but different fields (and id is convex id, not local)
      for (const it of nextItr) {
        const prevIt = prevItr.find((p: any) => p.id === it.id)
        if (!prevIt) continue
        if (prevIt.endMs !== it.endMs || prevIt.reason !== it.reason || prevIt.startMs !== it.startMs) {
          if (prevIt.endMs == null && it.endMs != null) {
            endItrMutation({ interruptionId: it.id }).catch(console.error)
          } else {
            updateItrMutation({
              interruptionId: it.id,
              reason: it.reason !== prevIt.reason ? it.reason : undefined,
              startMs: it.startMs !== prevIt.startMs ? it.startMs : undefined,
              endMs: it.endMs !== prevIt.endMs ? (it.endMs === null ? null : it.endMs) : undefined,
            }).catch(console.error)
          }
        }
      }
      // Deletes
      for (const id of prevIds) {
        if (!nextIds.has(id) && typeof id === 'string' && !id.startsWith('i')) {
          deleteItrMutation({ interruptionId: id }).catch(console.error)
        }
      }
      return next
    })
  }

  // Load teams from Convex when available
  useEffect(() => {
    if (teams && teams.length > 0) {
      const teamsMap: Record<string, any> = {}
      teams.forEach((team: any) => {
        teamsMap[team._id] = {
          ...emptyTeamSlice(),
          info: {
            id: team._id,
            name: team.name,
            maxRunners: team.maxRunners,
            pin: team.pin,
            category: team.category,
            goalLaps: team.goalLaps,
            color: team.color,
            ready: team.ready,
            profileImage: team.profileImage,
            contactName: team.contactName,
            contactPhone: team.contactPhone,
            chronoplaceSlug: team.chronoplaceSlug,
            chronoplaceResultsUrl: team.chronoplaceResultsUrl,
            chronoSyncEnabled: team.chronoSyncEnabled,
            lastChronoSyncAt: team.lastChronoSyncAt,
            chronoSyncError: team.chronoSyncError,
            dossard: team.dossard,
          },
          runners: [],
          order: [],
          laps: [],
          currentIdx: team.currentIdx,
        }
      })
      setTeamsById(teamsMap)
    }
  }, [teams])

  // Check if already unlocked in localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('teamlap.adminUnlocked')
      if (saved === '1') {
        setUnlocked(true)
      }
    } catch (_) {}
  }, [])

  // Toast notifications
  const [toasts, setToasts] = useState<Array<{ id: string; text: string; icon?: string }>>([])
  const pushToast = (text: string, icon?: string) => {
    const id = Math.random().toString(36).slice(2)
    setToasts(s => [...s, { id, text, icon }])
    setTimeout(() => setToasts(s => s.filter(t => t.id !== id)), 2400)
  }

  const handleUnlock = () => {
    setUnlocked(true)
    try {
      localStorage.setItem('teamlap.adminUnlocked', '1')
    } catch (_) {}
  }

  const handleCancel = () => {
    navigate({ to: '/' })
  }

  // Team CRUD with Convex persistence
  const addTeam = async () => {
    if (!event?._id) {
      pushToast('Événement non chargé', 'AlertTriangle')
      return
    }
    
    const idx = Object.keys(teamsById).length
    const teamData = {
      eventId: event._id,
      name: `Équipe ${idx + 1}`,
      category: 'Mixte',
      color: TEAM_COLOR_PALETTE[idx % TEAM_COLOR_PALETTE.length],
      maxRunners: 6,
      goalLaps: 200,
      pin: '0000',
    }
    
    try {
      await createTeamMutation(teamData)
      pushToast('Équipe ajoutée', 'Plus')
    } catch (error) {
      console.error('Error creating team:', error)
      pushToast('Erreur lors de la création', 'AlertTriangle')
    }
  }

  const updateTeamInfo = async (id: string, patch: any) => {
    setTeamsById(prev => {
      if (!prev[id]) return prev
      return { ...prev, [id]: { ...prev[id], info: { ...prev[id].info, ...patch } } }
    })
    
    // Persist to Convex
    try {
      await updateTeamMutation({ teamId: id, updates: patch })
    } catch (error) {
      console.error('Error updating team:', error)
      pushToast('Erreur lors de la mise à jour', 'AlertTriangle')
    }
  }

  const removeTeam = async (id: string) => {
    if (!window.confirm("Supprimer cette équipe et toutes ses données ?")) return
    
    try {
      await deleteTeamMutation({ teamId: id })
      setTeamsById(prev => {
        const cp = { ...prev }
        delete cp[id]
        return cp
      })
      pushToast('Équipe supprimée', 'Trash2')
    } catch (error) {
      console.error('Error deleting team:', error)
      pushToast('Erreur lors de la suppression', 'AlertTriangle')
    }
  }

  // Race controls — persisted to Convex
  const startRaceNow = async () => {
    if (!event?._id) return
    try {
      await startRaceNowMutation({ eventId: event._id })
      pushToast('Course lancée — top départ !', 'Rocket')
    } catch (e) { console.error(e); pushToast('Erreur démarrage', 'AlertTriangle') }
  }

  const startRaceAtScheduled = async () => {
    if (!event?._id) return
    try {
      await startRaceAtScheduledMutation({ eventId: event._id })
      pushToast("Course alignée sur l'heure programmée", 'Calendar')
    } catch (e) { console.error(e); pushToast('Erreur', 'AlertTriangle') }
  }

  const stopRace = async () => {
    if (!event?._id) return
    try {
      await stopRaceMutation({ eventId: event._id })
      pushToast('Course arrêtée', 'Square')
    } catch (e) { console.error(e) }
  }

  const correctActualStart = async (isoString: string) => {
    if (!event?._id) return
    const ts = new Date(isoString).getTime()
    if (isNaN(ts)) return
    try {
      await correctActualStartMutation({ eventId: event._id, actualStart: ts })
      pushToast("Heure de départ effective corrigée", 'Edit3')
    } catch (e) { console.error(e) }
  }

  const resetRace = async () => {
    if (!event?._id) return
    if (!window.confirm("Réinitialiser la course ?\n\nLe départ, tous les tours de toutes les équipes, et les interruptions seront effacés.")) return
    try {
      await resetRaceMutation({ eventId: event._id })
      pushToast('Course réinitialisée', 'RefreshCcw')
    } catch (e) { console.error(e) }
    setTeamsById(prev => {
      const cp: Record<string, any> = {}
      for (const id of Object.keys(prev)) {
        cp[id] = {
          ...prev[id],
          laps: [],
          currentIdx: 0,
          info: { ...prev[id].info, ready: false },
        }
      }
      return cp
    })
    pushToast('Course réinitialisée', 'RefreshCcw')
  }

  if (!unlocked) {
    return (
      <PinGate
        title="Accès administrateur"
        hint="Saisis le mot de passe administrateur."
        expected={event?.adminPassword || DEFAULT_ADMIN_PASSWORD}
        numeric={false}
        label="Mot de passe"
        minLength={1}
        onUnlock={handleUnlock}
        onCancel={handleCancel}
      />
    )
  }

  return (
    <>
      <AdminScreen
        admin={admin}
        setAdmin={setAdminPersist}
        teamsById={teamsById}
        addTeam={addTeam}
        updateTeamInfo={updateTeamInfo}
        removeTeam={removeTeam}
        startRaceNow={startRaceNow}
        startRaceAtScheduled={startRaceAtScheduled}
        stopRace={stopRace}
        correctActualStart={correctActualStart}
        resetRace={resetRace}
        pushToast={pushToast}
        maxRunnersPerTeam={(event as any)?.maxRunnersPerTeam ?? 10}
        onSetMaxRunnersPerTeam={async (value: number) => {
          if (!event?._id) throw new Error('Événement non chargé')
          await setMaxRunnersPerTeamMutation({ eventId: event._id, value })
        }}
        latitude={(event as any)?.latitude ?? null}
        longitude={(event as any)?.longitude ?? null}
        cityName={(event as any)?.cityName ?? null}
        onSetLatLng={async (lat: number | null, lng: number | null, city?: string | null) => {
          if (!event?._id) throw new Error('Événement non chargé')
          await setLatLngMutation({
            eventId: event._id,
            latitude: lat ?? undefined,
            longitude: lng ?? undefined,
            cityName: city ?? undefined,
          })
        }}
        relayTransitionSec={(event as any)?.relayTransitionSec ?? 5}
        onSetRelayTransitionSec={async (seconds: number) => {
          if (!event?._id) throw new Error('Événement non chargé')
          await setRelayTransitionSecMutation({ eventId: event._id, seconds })
        }}
        chronoplaceEventId={(event as any)?.chronoplaceEventId}
        onSetChronoplaceEventId={async (value: number | undefined) => {
          if (!event?._id) throw new Error('Événement non chargé')
          await setChronoplaceEventIdMutation({ eventId: event._id, chronoplaceEventId: value })
        }}
        chronoplaceClassementUrl={(event as any)?.chronoplaceClassementUrl}
        onSetChronoplaceClassementUrl={async (url: string | undefined) => {
          if (!event?._id) throw new Error('Événement non chargé')
          await setChronoplaceClassementUrlMutation({ eventId: event._id, url })
        }}
        organizerUrl={(event as any)?.organizerUrl}
        onSetOrganizerUrl={async (url: string | undefined) => {
          if (!event?._id) throw new Error('Événement non chargé')
          await setOrganizerUrlMutation({ eventId: event._id, url })
        }}
        onSetChronoplaceSlug={async (teamId: string, slug: string | undefined) => {
          await setChronoplaceSlugMutation({ teamId, slug })
        }}
        onSetChronoplaceResultsUrl={async (teamId: string, url: string | undefined) => {
          await setChronoplaceResultsUrlMutation({ teamId, url })
        }}
        onSetDossard={async (teamId: string, dossard: string | undefined) => {
          await setDossardMutation({ teamId, dossard })
        }}
        onSetChronoSyncEnabled={async (teamId: string, enabled: boolean) => {
          await setChronoSyncEnabledMutation({ teamId, enabled })
        }}
        onForceChronoSync={async (teamId: string) => {
          try {
            const r = await forceChronoSyncAction({ teamId })
            return (r ?? null) as any
          } catch (e: any) {
            return { ok: false, error: e?.message || 'error' }
          }
        }}
        testMode={(event as any)?.testMode ?? true}
        onSetTestMode={async (value: boolean) => {
          if (!event?._id) throw new Error('Événement non chargé')
          await setTestModeMutation({ eventId: event._id, value })
        }}
        testModeLocked={(() => {
          const ev = event as any
          if (!ev) return false
          if (ev.status !== 'scheduled') return true
          return false
        })()}
        testModeLockReason={(() => {
          const ev = event as any
          if (!ev) return undefined
          if (ev.status !== 'scheduled') return 'Course démarrée ou terminée'
          return undefined
        })()}
        actualEnd={(event as any)?.actualEnd ?? null}
        onEndRace={async () => {
          if (!event?._id) throw new Error('Événement non chargé')
          await endRaceMutation({ eventId: event._id })
        }}
      />
      {/* Toast notifications */}
      <div className="toast-stack">
        {toasts.map(t => (
          <div key={t.id} className="toast">
            <span className="toast-icon">{t.icon || '✓'}</span>
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </>
  )
}