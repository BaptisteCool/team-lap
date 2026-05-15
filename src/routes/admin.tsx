import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { AdminScreen } from '../components/AdminScreen'
import { PinGate } from '../components/PinGate'
import { useMutation, useQuery } from '../convex/hooks'
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
  const updateLapBoundsMutation = useMutation('events:updateLapBounds' as any)
  const setMaxRunnersPerTeamMutation = useMutation('events:setMaxRunnersPerTeam' as any)
  const setLatLngMutation = useMutation('events:setLatLng' as any)
  const startItrMutation = useMutation('events:startInterruption' as any)
  const endItrMutation = useMutation('events:endInterruption' as any)
  const updateItrMutation = useMutation('events:updateInterruption' as any)
  const deleteItrMutation = useMutation('events:deleteInterruption' as any)

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
      minLapSec: event.minLapSec ?? 165,
      maxLapSec: event.maxLapSec ?? 480,
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
      // Lap time bounds (min / max per lap, in seconds)
      if (prev.minLapSec !== next.minLapSec || prev.maxLapSec !== next.maxLapSec) {
        updateLapBoundsMutation({
          eventId: event._id,
          minLapSec: next.minLapSec,
          maxLapSec: next.maxLapSec,
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
        onSetLatLng={async (lat: number | null, lng: number | null) => {
          if (!event?._id) throw new Error('Événement non chargé')
          await setLatLngMutation({
            eventId: event._id,
            latitude: lat ?? undefined,
            longitude: lng ?? undefined,
          })
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