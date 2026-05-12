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
    const event = useQuery('events:getBySlug' as any, { slug: '24h-brette-les-pins-2026' }) as any

    // Get all teams for the event
    const teams = useQuery(
      'teams:getTeams' as any,
      event?._id ? { eventId: event._id } : 'skip',
    ) as any[] | null | undefined

    const handlePickTeam = (teamId: string) => {
      const team = teams?.find(t => t._id === teamId)
      if (team) {
        setSelectedTeamId(teamId)
      }
    }

    const handleUnlock = () => {
      if (selectedTeamId) {
        navigate({ to: '/team/$teamId', params: { teamId: selectedTeamId }, search: { tab: 'live', readonly: false } })
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

    return <HomeScreen onPickTeam={handlePickTeam} />
  },
})
