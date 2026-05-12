import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { PlanningScreen } from '../components/PlanningScreen'
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

  // Order of runners for relay
  const [order, setOrder] = useState<string[]>(DEFAULT_RUNNERS.slice(0, 6).map(r => r.id))

  // Current screen: 'setup' | 'planning' | 'live'
  const [screen, setScreen] = useState<'setup' | 'planning' | 'live'>('setup')

  // Schedule for planning
  const [schedule] = useState({ startISO: '2026-05-16T15:00', endISO: '2026-05-17T15:00' })

  const handleContinueSetup = () => {
    setScreen('planning')
  }

  const handleBackPlanning = () => {
    setScreen('setup')
  }

  const handleContinuePlanning = () => {
    setScreen('live')
    alert('Tracker en direct (à implémenter)')
  }

  const handleBackLive = () => {
    setScreen('planning')
  }

  return (
    <>
      {screen === 'setup' && (
        <SetupScreen
          team={team}
          setTeam={setTeam}
          runners={runners}
          setRunners={setRunners}
          onContinue={handleContinueSetup}
        />
      )}
      {screen === 'planning' && (
        <PlanningScreen
          runners={runners}
          order={order}
          setOrder={setOrder}
          schedule={schedule}
          onContinue={handleContinuePlanning}
          onBack={handleBackPlanning}
        />
      )}
      {screen === 'live' && (
        <div className="page">
          <div className="card">
            <div className="card-head">
              <span>🏃</span>
              <h3>Tracker en direct</h3>
            </div>
            <div className="card-body">
              <p>Le tracker en direct sera implémenté prochainement.</p>
              <button className="btn primary" onClick={handleBackLive}>
                ← Retour au planning
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}