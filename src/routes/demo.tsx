import { createFileRoute, Outlet, useLocation } from '@tanstack/react-router'
import { DemoBanner } from '../components/DemoBanner'

export const DEMO_EVENT_SLUG = 'demo-mock-event'

export const Route = createFileRoute('/demo')({
  component: DemoLayout,
})

function DemoLayout() {
  const location = useLocation()
  return (
    <div className="demo-page">
      <DemoBanner subtitle="Simulation locale · jouable navigateur" />
      <div key={location.pathname}>
        <Outlet />
      </div>
    </div>
  )
}
