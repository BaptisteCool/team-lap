import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { HomeScreen } from '../components/HomeScreen'
import { PinGate } from '../components/PinGate'
import { useQuery } from '../convex/hooks'

export const Route = createFileRoute('/')({
  component: function Index() {
    const navigate = useNavigate()
    const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)

    // Get the event by slug
    const event = useQuery('events:getBySlug' as any, { slug: '24h-brette-les-pins-2026' })
    
    // Get all teams for the event
    const teams = useQuery('teams:getTeams' as any, { eventId: event?._id || 'placeholder' }) as any[] | null | undefined

    // Get race state from admin (simplified for now)
    const raceStarted = false
    const raceStartTime = null

    const handlePickTeam = (teamId: string) => {
      const team = teams?.find(t => t._id === teamId)
      if (team) {
        setSelectedTeamId(teamId)
      }
    }

    const handleUnlock = () => {
      if (selectedTeamId) {
        navigate({ to: '/event/$eventId', params: { eventId: selectedTeamId } })
      }
    }

    const handleCancel = () => {
      setSelectedTeamId(null)
    }

    // If a team is selected, show PIN gate
    if (selectedTeamId) {
      const team = teams?.find((t: any) => t._id === selectedTeamId)
      if (!team) {
        setSelectedTeamId(null)
        return null
      }

      return (
        <PinGate
          title={`Accès équipe : ${team.name}`}
          hint="Entrez le code PIN de votre équipe"
          expected={team.pin}
          onUnlock={handleUnlock}
          onCancel={handleCancel}
          numeric={true}
          label="Code PIN"
          minLength={4}
        />
      )
    }

    return (
      <HomeScreen
        onPickTeam={handlePickTeam}
        raceStarted={raceStarted}
        raceStartTime={raceStartTime}
      />
    )
  },
})
