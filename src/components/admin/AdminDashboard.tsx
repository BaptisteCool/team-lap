import { useState } from 'react'
import { useQuery } from '../../convex/hooks'
import { EventStatusFilter } from './EventStatusFilter'
import { EventsTable } from './EventsTable'
import { CreateEventDialog } from './CreateEventDialog'

type EventStatus = 'all' | 'scheduled' | 'running' | 'finished'

type ConvexEvent = {
  _id: string
  name: string
  slug: string
  status: string
  scheduledStart?: number
  scheduledEnd?: number
}

export function AdminDashboard() {
  const [statusFilter, setStatusFilter] = useState<EventStatus>('all')
  const [showCreate, setShowCreate] = useState(false)

  const allEvents = useQuery('events:list' as any) as ConvexEvent[] | undefined

  if (allEvents === undefined) {
    return (
      <div className="page">
        <div style={{ maxWidth: 900, margin: '0 auto', paddingTop: 48 }}>
          <div className="card">
            <div className="card-body" style={{ textAlign: 'center', color: 'var(--muted)' }}>
              Chargement...
            </div>
          </div>
        </div>
      </div>
    )
  }

  const sorted = [...allEvents].sort((a, b) => (b.scheduledStart ?? 0) - (a.scheduledStart ?? 0))

  const counts = {
    all: sorted.length,
    scheduled: sorted.filter(e => e.status === 'scheduled').length,
    running: sorted.filter(e => e.status === 'running').length,
    finished: sorted.filter(e => e.status === 'finished').length,
  }

  const filtered = statusFilter === 'all'
    ? sorted
    : sorted.filter(e => e.status === statusFilter)

  return (
    <div className="page">
      <div style={{ maxWidth: 900, margin: '0 auto', paddingTop: 48 }}>
        <div className="grid" style={{ gap: 18 }}>
          <div className="card">
            <div className="card-head">
              <h3>Super Admin</h3>
              <button
                className="btn primary"
                style={{ marginLeft: 'auto' }}
                onClick={() => setShowCreate(true)}
              >
                Nouvel event
              </button>
            </div>
            <div className="card-body grid" style={{ gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <EventStatusFilter
                  active={statusFilter}
                  counts={counts}
                  onChange={setStatusFilter}
                />
                <span className="hint" style={{ marginLeft: 'auto' }}>
                  <span className="mono" style={{ color: 'var(--text)', fontWeight: 600 }}>{filtered.length}</span>
                  {' '}event{filtered.length !== 1 ? 's' : ''}
                </span>
              </div>
              <EventsTable
                events={filtered}
                onCreateFirst={statusFilter === 'all' ? () => setShowCreate(true) : undefined}
                emptyMessage={
                  statusFilter === 'all'
                    ? 'Aucun event cree pour le moment'
                    : 'Aucun event dans cette categorie'
                }
              />
            </div>
          </div>
        </div>
      </div>

      {showCreate && (
        <CreateEventDialog onClose={() => setShowCreate(false)} />
      )}
    </div>
  )
}
