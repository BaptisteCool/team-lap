import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { SetupScreen } from '../components/SetupScreen'
import { DEFAULT_RUNNERS, TEAM_COLOR_PALETTE, emptyTeamSlice } from '../lib/race-data'

export const Route = createFileRoute('/event/$eventId')({
  component: EventPage,
})

function EventPage() {
  const { eventId } = Route.useParams()
  const navigate = useNavigate()

  // Demo team data
  const [team, setTeam] = useState<any>({
    ...emptyTeamSlice().info,
    id: eventId,
    name: 'Équipe Alpha',
    maxRunners: 6,
    pin: '0000',
    category: 'Mixte',
    goalLaps: 200,
    color: TEAM_COLOR_PALETTE[0],
  })

  // Demo runners data
  const [runners, setRunners] = useState<any>(DEFAULT_RUNNERS.slice(0, 6))

  const handleContinue = () => {
    console.log('Continue to planning', { team, runners })
    // TODO: Navigate to planning screen
    alert('Étape suivante : Planning (à implémenter)')
  }

  return (
    <SetupScreen
      team={team}
      setTeam={setTeam}
      runners={runners}
      setRunners={setRunners}
      onContinue={handleContinue}
    />
  )
}
