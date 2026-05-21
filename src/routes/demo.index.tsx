import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { OfflineSimulationScreen } from '../components/OfflineSimulationScreen'

export const Route = createFileRoute('/demo/')({
  component: DemoHome,
})

function DemoHome() {
  const navigate = useNavigate()
  return (
    <OfflineSimulationScreen
      eventSlug="demo-mock-event"
      onPickTeam={(teamId) => navigate({ to: '/demo/team/$teamId', params: { teamId } })}
      hideAdminButton
    />
  )
}
