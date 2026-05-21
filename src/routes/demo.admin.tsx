import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { DEMO_EVENT_SLUG } from './demo'

export const Route = createFileRoute('/demo/admin')({
  component: DemoAdminRedirect,
})

function DemoAdminRedirect() {
  const navigate = useNavigate()
  useEffect(() => {
    // Pre-unlock admin PIN for the demo sandbox.
    try { localStorage.setItem('teamlap.adminUnlocked', '1') } catch (_) {}
    navigate({
      to: '/event/$eventSlug/admin',
      params: { eventSlug: DEMO_EVENT_SLUG },
      replace: true,
    })
  }, [navigate])
  return (
    <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>
      Ouverture de l'admin démo…
    </div>
  )
}
