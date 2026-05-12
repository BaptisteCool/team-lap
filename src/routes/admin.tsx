import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { AdminScreen } from '../components/AdminScreen'
import { PinGate } from '../components/PinGate'
import { useMutation, useQuery } from '../convex/hooks'
import { DEFAULT_ADMIN_PASSWORD, defaultAdminState, emptyTeamSlice, TEAM_COLOR_PALETTE } from '../lib/race-data'

export const Route = createFileRoute('/admin')({
  component: AdminPage,
})

function AdminPage() {
  const navigate = useNavigate()
  const [unlocked, setUnlocked] = useState(false)
  const [admin, setAdmin] = useState(defaultAdminState())
  const [teamsById, setTeamsById] = useState<Record<string, any>>({})
  
  // Get event from Convex
  const event = useQuery('teams:getEventBySlug' as any, { slug: '24h-brette-les-pins-2026' })
  
  // Get teams from Convex
  const teams = useQuery('teams:getTeams' as any, { eventId: event?._id || 'placeholder' })
  
  // Mutations
  const createTeamMutation = useMutation('teams:createTeam' as any)
  const updateTeamMutation = useMutation('teams:updateTeam' as any)
  const deleteTeamMutation = useMutation('teams:deleteTeam' as any)

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

  const handleLock = () => {
    setUnlocked(false)
    try {
      localStorage.removeItem('teamlap.adminUnlocked')
    } catch (_) {}
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
      const teamId = await createTeamMutation(teamData)
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

  // Race controls
  const startRaceNow = () => {
    setAdmin((a: any) => ({ ...a, race: { started: true, startTime: Date.now() } }))
    pushToast('Course lancée — top départ !', 'Rocket')
  }

  const startRaceAtScheduled = () => {
    const ts = admin.schedule.startISO ? new Date(admin.schedule.startISO).getTime() : null
    if (!ts) return
    setAdmin((a: any) => ({ ...a, race: { started: true, startTime: ts } }))
    pushToast("Course alignée sur l'heure programmée", 'Calendar')
  }

  const stopRace = () => {
    setAdmin((a: any) => ({ ...a, race: { ...a.race, started: false } }))
    pushToast('Course arrêtée', 'Square')
  }

  const correctActualStart = (isoString: string) => {
    const ts = new Date(isoString).getTime()
    if (isNaN(ts)) return
    setAdmin((a: any) => ({ ...a, race: { ...a.race, startTime: ts } }))
    pushToast("Heure de départ effective corrigée", 'Edit3')
  }

  const resetRace = () => {
    if (!window.confirm("Réinitialiser la course ?\n\nLe départ, tous les tours de toutes les équipes, et les interruptions seront effacés.")) return
    setAdmin((a: any) => ({ ...a, race: { started: false, startTime: null }, interruptions: [] }))
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
        expected={DEFAULT_ADMIN_PASSWORD}
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
        setAdmin={setAdmin}
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
        onLock={handleLock}
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