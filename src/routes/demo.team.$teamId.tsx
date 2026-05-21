import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { DEMO_EVENT_SLUG } from './demo'

export const Route = createFileRoute('/demo/team/$teamId')({
  component: DemoTeamRedirect,
})

function DemoTeamRedirect() {
  const { teamId } = Route.useParams()
  const navigate = useNavigate()
  useEffect(() => {
    // Pre-unlock admin PIN so the team route's admin nav still works in demo mode.
    try { localStorage.setItem('teamlap.adminUnlocked', '1') } catch (_) {}
    navigate({
      to: '/event/$eventSlug/team/$teamId',
      params: { eventSlug: DEMO_EVENT_SLUG, teamId },
      search: { tab: 'live', readonly: false },
      replace: true,
    })
  }, [navigate, teamId])
  return (
    <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>
      Ouverture de l'équipe démo…
    </div>
  )
}
