import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useQuery } from '../convex/hooks'
import { EventList } from '../components/EventList'

export const Route = createFileRoute('/')({
  component: IndexPage,
})

const DEMO_SLUG = 'demo-mock-event'

function IndexPage() {
  const navigate = useNavigate()
  const allEvents = useQuery('events:list' as any) as any[] | null | undefined
  const events = allEvents?.filter((e: any) => e?.slug !== DEMO_SLUG)

  useEffect(() => {
    if (!events || events.length !== 1) return
    navigate({ to: '/event/$eventSlug', params: { eventSlug: events[0].slug }, replace: true })
  }, [events])

  // Still loading or error
  if (!events) {
    return null
  }

  // 0 events
  if (events.length === 0) {
    return (
      <div className="page">
        <div className="grid" style={{ gap: 18, maxWidth: 480, margin: '0 auto', paddingTop: 48 }}>
          <div className="card">
            <div className="card-body" style={{ textAlign: 'center', padding: '32px 24px' }}>
              <p className="hint">Aucun event disponible.</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 1 event — redirect handled in useEffect above, render nothing during transition
  if (events.length === 1) {
    return null
  }

  // N events — show list
  return <EventList events={events as any[]} />
}
