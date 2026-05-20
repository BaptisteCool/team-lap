import { createFileRoute, Outlet } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useQuery } from '../convex/hooks'
import { EventNotFound } from '../components/EventNotFound'
import { setLastEventSlug } from '../lib/last-event-cookie'

export const Route = createFileRoute('/event/$eventSlug')({
  component: EventLayout,
})

function EventLayout() {
  const { eventSlug } = Route.useParams()
  const event = useQuery('events:getBySlug' as any, { slug: eventSlug }) as any

  useEffect(() => {
    if (event) {
      setLastEventSlug(eventSlug)
    }
  }, [event, eventSlug])

  // Still loading
  if (event === undefined) {
    return null
  }

  // Not found
  if (event === null) {
    return <EventNotFound slug={eventSlug} />
  }

  return <Outlet />
}
