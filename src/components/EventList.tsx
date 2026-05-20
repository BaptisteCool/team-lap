import { useNavigate } from '@tanstack/react-router'

interface EventItem {
  _id: string
  slug: string
  name?: string
  status?: string
  scheduledStart?: number
}

interface EventListProps {
  events: EventItem[]
}

export function EventList({ events }: EventListProps) {
  const navigate = useNavigate()

  return (
    <div className="page">
      <div className="grid" style={{ gap: 18, maxWidth: 640, margin: '0 auto', paddingTop: 32 }}>
        <div className="card">
          <div className="card-head">
            <h3>Choisir un event</h3>
          </div>
          <div className="card-body">
            <div className="grid" style={{ gap: 10 }}>
              {events.map((ev) => (
                <button
                  key={ev._id}
                  className="card"
                  style={{
                    background: 'var(--bg-2)',
                    borderRadius: 12,
                    padding: '14px 16px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                  onClick={() =>
                    navigate({ to: '/event/$eventSlug', params: { eventSlug: ev.slug } })
                  }
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{ev.name || ev.slug}</div>
                    <div className="hint mono" style={{ marginTop: 2 }}>{ev.slug}</div>
                  </div>
                  {ev.status && (
                    <span
                      className="badge"
                      style={{
                        background:
                          ev.status === 'running'
                            ? 'oklch(0.7 0.2 145 / 0.18)'
                            : 'var(--bg)',
                        color:
                          ev.status === 'running'
                            ? 'oklch(0.7 0.2 145)'
                            : 'var(--muted)',
                        border:
                          ev.status === 'running'
                            ? '1px solid oklch(0.7 0.2 145 / 0.5)'
                            : '1px solid var(--border)',
                        fontSize: 11,
                      }}
                    >
                      {ev.status === 'running'
                        ? 'En cours'
                        : ev.status === 'finished'
                          ? 'Terminé'
                          : 'A venir'}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
