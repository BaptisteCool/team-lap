import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useQuery } from '../convex/hooks'
import { getLastEventSlug } from '../lib/last-event-cookie'

export const Route = createFileRoute('/team/$teamId')({
  component: TeamRedirect,
})

function TeamRedirect() {
  const { teamId } = Route.useParams()
  const navigate = useNavigate()
  const events = useQuery('events:list' as any) as any[] | null | undefined

  useEffect(() => {
    if (events === undefined || events === null) return

    // Try cookie first — preserve teamId in redirect
    const cookieSlug = getLastEventSlug()
    if (cookieSlug) {
      navigate({
        to: '/event/$eventSlug/team/$teamId',
        params: { eventSlug: cookieSlug, teamId },
        search: { tab: 'planning', readonly: true },
        replace: true,
      })
      return
    }

    // Fallback: unique published event — preserve teamId
    if (Array.isArray(events) && events.length === 1) {
      navigate({
        to: '/event/$eventSlug/team/$teamId',
        params: { eventSlug: events[0].slug, teamId },
        search: { tab: 'planning', readonly: true },
        replace: true,
      })
      return
    }

    // Fallback: root
    navigate({ to: '/', replace: true })
  }, [events])

  return null
}
