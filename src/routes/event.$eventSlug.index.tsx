import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery } from '../convex/hooks'
import { HomeScreen } from '../components/HomeScreen'
import { OfflineSimulationScreen } from '../components/OfflineSimulationScreen'

export const Route = createFileRoute('/event/$eventSlug/')({
  component: EventIndex,
})

function EventIndex() {
  const navigate = useNavigate()
  const { eventSlug } = Route.useParams()
  const event = useQuery('events:getBySlug' as any, { slug: eventSlug }) as any
  const [offlineMode, setOfflineMode] = useState(false)

  const handlePickTeam = (teamId: string) => {
    navigate({
      to: '/event/$eventSlug/team/$teamId',
      params: { eventSlug, teamId },
      search: { tab: 'planning', readonly: true },
    })
  }

  const status = event?.status as string | undefined
  const canOffline = status === 'scheduled' || status === 'finished'

  return (
    <>
      {canOffline && (
        <div className="offline-toggle-bar">
          <button
            type="button"
            className={`demo-ctrl-btn${offlineMode ? ' is-active' : ''}`}
            onClick={() => setOfflineMode((v) => !v)}
            title={offlineMode ? 'Quitter le mode replay' : 'Activer le replay local (start/restart/fin)'}
          >
            {offlineMode ? '⏹ Quitter replay' : '▶ Mode replay local'}
          </button>
          <span className="demo-controls-hint">
            {status === 'finished' ? 'Course terminée — replay local possible' : 'Course non démarrée — replay local possible'}
          </span>
        </div>
      )}
      {offlineMode ? (
        <OfflineSimulationScreen
          eventSlug={eventSlug}
          onPickTeam={handlePickTeam}
          hideAdminButton={false}
        />
      ) : (
        <HomeScreen eventSlug={eventSlug} onPickTeam={handlePickTeam} />
      )}
    </>
  )
}
