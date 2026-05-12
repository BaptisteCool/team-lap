import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { LiveScreen } from '../components/LiveScreen'
import { PlanningScreen } from '../components/PlanningScreen'
import { SetupScreen } from '../components/SetupScreen'
import { useMutation, useQuery } from '../convex/hooks'
import { DEFAULT_RUNNERS, TEAM_COLOR_PALETTE, emptyTeamSlice } from '../lib/race-data'

export const Route = createFileRoute('/event/$eventId')({
  component: EventPage,
})

function EventPage() {
  const { eventId } = Route.useParams()

  // Get team data from Convex
  const teamData = useQuery('teams:getTeam' as any, { teamId: eventId as any })

  // Get runners from Convex
  const runnersData = useQuery('teams:getTeam' as any, { teamId: eventId as any })

  // Mutation for persisting team edits (image, contact)
  const updateTeamMutation = useMutation('teams:updateTeam' as any)
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Local state for team
  const [team, setTeam] = useState<any>({
    ...emptyTeamSlice().info,
    id: eventId,
    name: 'Équipe Alpha',
    maxRunners: 6,
    pin: '0000',
    category: 'Mixte',
    goalLaps: 200,
    color: TEAM_COLOR_PALETTE[0],
    ready: false,
    profileImage: undefined,
    contactName: undefined,
    contactPhone: undefined,
  })

  // Local state for runners
  const [runners, setRunners] = useState<any>(DEFAULT_RUNNERS.slice(0, 6))

  // Sync team data from Convex when available
  useEffect(() => {
    if (teamData) {
      setTeam({
        id: teamData._id,
        name: teamData.name,
        maxRunners: teamData.maxRunners,
        pin: teamData.pin,
        category: teamData.category,
        goalLaps: teamData.goalLaps,
        color: teamData.color,
        ready: teamData.ready,
        profileImage: teamData.profileImage,
        contactName: teamData.contactName,
        contactPhone: teamData.contactPhone,
      })
    }
  }, [teamData])

  // Wrap setTeam: keep local React state, debounce-persist editable fields to Convex
  const setTeamPersist: typeof setTeam = (updater) => {
    setTeam((prev: any) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      if (teamData?._id) {
        const patch: Record<string, any> = {}
        if (next.profileImage !== prev.profileImage) patch.profileImage = next.profileImage
        if (next.contactName !== prev.contactName) patch.contactName = next.contactName
        if (next.contactPhone !== prev.contactPhone) patch.contactPhone = next.contactPhone
        if (Object.keys(patch).length > 0) {
          if (persistTimer.current) clearTimeout(persistTimer.current)
          persistTimer.current = setTimeout(() => {
            updateTeamMutation({ teamId: teamData._id, updates: patch }).catch((err: any) => {
              console.error('Error persisting team edit:', err)
            })
          }, 400)
        }
      }
      return next
    })
  }

  // Sync runners from Convex when available
  useEffect(() => {
    if (runnersData?.runners && runnersData.runners.length > 0) {
      setRunners(runnersData.runners)
    }
  }, [runnersData])

  // Order of runners for relay
  const [order, setOrder] = useState<string[]>(DEFAULT_RUNNERS.slice(0, 6).map(r => r.id))

  // Race state
  const [race, setRace] = useState<any>({
    started: false,
    startTime: null,
    laps: [],
    currentIdx: 0,
  })

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
  }

  const handleBackLive = () => {
    setScreen('planning')
  }

  return (
    <>
      {screen === 'setup' && (
        <SetupScreen
          team={team}
          setTeam={setTeamPersist}
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
        <LiveScreen
          runners={runners}
          order={order}
          race={race}
          setRace={setRace}
          onBack={handleBackLive}
        />
      )}
    </>
  )
}