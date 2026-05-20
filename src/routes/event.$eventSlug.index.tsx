import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { HomeScreen } from '../components/HomeScreen'

export const Route = createFileRoute('/event/$eventSlug/')({
  component: EventIndex,
})

function EventIndex() {
  const navigate = useNavigate()
  const { eventSlug } = Route.useParams()

  const handlePickTeam = (teamId: string) => {
    navigate({
      to: '/event/$eventSlug/team/$teamId',
      params: { eventSlug, teamId },
      search: { tab: 'planning', readonly: true },
    })
  }

  return <HomeScreen eventSlug={eventSlug} onPickTeam={handlePickTeam} />
}
