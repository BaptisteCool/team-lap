import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '../../convex/hooks'

type ConvexEvent = {
  _id: string
  name: string
  slug: string
  status: string
  scheduledStart?: number
  scheduledEnd?: number
}

type EventsTableProps = {
  events: ConvexEvent[]
  onCreateFirst?: () => void
  emptyMessage?: string
}

function formatDate(ts?: number): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  })
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'running') {
    return (
      <span className="badge" style={{ background: 'oklch(0.86 0.20 135 / 0.18)', color: 'oklch(0.92 0.20 135)', borderColor: 'oklch(0.86 0.20 135 / 0.5)' }}>
        En cours
      </span>
    )
  }
  if (status === 'finished') {
    return (
      <span className="badge" style={{ background: 'var(--surface-2)', color: 'var(--muted)', borderColor: 'var(--border)' }}>
        Termine
      </span>
    )
  }
  return (
    <span className="badge" style={{ background: 'oklch(0.80 0.13 220 / 0.18)', color: 'oklch(0.85 0.13 220)', borderColor: 'oklch(0.80 0.13 220 / 0.5)' }}>
      A venir
    </span>
  )
}

function TeamCountCell({ eventId }: { eventId: string }) {
  const teams = useQuery('teams:getTeams' as any, { eventId })
  if (teams === undefined) return <span className="mono" style={{ color: 'var(--muted)' }}>...</span>
  return <span className="mono">{(teams as any[]).length}</span>
}

function EventTableRow({ ev }: { ev: ConvexEvent }) {
  const navigate = useNavigate()

  return (
    <tr
      onClick={() => navigate({ to: '/event/$eventSlug/admin', params: { eventSlug: ev.slug } })}
      style={{
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <td style={{ padding: '12px 12px', fontWeight: 500, color: 'var(--text)' }}>
        {ev.name}
      </td>
      <td style={{ padding: '12px 12px' }}>
        <span className="mono" style={{ fontSize: 12, color: 'var(--text-2)' }}>
          {ev.slug}
        </span>
      </td>
      <td style={{ padding: '12px 12px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
        {formatDate(ev.scheduledStart)}
      </td>
      <td style={{ padding: '12px 12px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
        {formatDate(ev.scheduledEnd)}
      </td>
      <td style={{ padding: '12px 12px' }}>
        <StatusBadge status={ev.status} />
      </td>
      <td style={{ padding: '12px 12px', color: 'var(--text-2)' }}>
        <TeamCountCell eventId={ev._id} />
      </td>
    </tr>
  )
}

export function EventsTable({ events, onCreateFirst, emptyMessage }: EventsTableProps) {
  if (events.length === 0) {
    return (
      <div className="empty" style={{ padding: 40 }}>
        <div style={{ marginBottom: 12 }}>
          {emptyMessage ?? 'Aucun event cree pour le moment'}
        </div>
        {onCreateFirst && (
          <button className="btn primary" onClick={onCreateFirst}>
            Creer le premier event
          </button>
        )}
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Nom', 'Slug', 'Debut', 'Fin', 'Status', 'Equipes'].map(col => (
              <th
                key={col}
                style={{
                  padding: '8px 12px',
                  textAlign: 'left',
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  whiteSpace: 'nowrap',
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {events.map(ev => (
            <EventTableRow key={ev._id} ev={ev} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
