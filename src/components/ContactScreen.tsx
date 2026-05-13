interface TeamInfo {
  name: string
  color: string
  category: string
  contactName?: string
  contactPhone?: string
  profileImage?: string
}

interface EventInfo {
  name?: string
  contact?: { email?: string; phone?: string }
}

interface ContactScreenProps {
  team: TeamInfo
  event?: EventInfo | null
}

export function ContactScreen({ team, event }: ContactScreenProps) {
  const adminEmail = event?.contact?.email
  const adminPhone = event?.contact?.phone

  return (
    <div className="grid" style={{ gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
      <div className="card" style={{ borderLeft: `4px solid ${team.color || 'var(--accent)'}` }}>
        <div className="card-head">
          <span>👥</span>
          <h3>Référent équipe</h3>
        </div>
        <div className="card-body grid" style={{ gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {team.profileImage ? (
              <img
                src={team.profileImage}
                alt={team.name}
                style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover', border: '1px solid var(--border)' }}
              />
            ) : (
              <div
                className="mono"
                style={{
                  width: 56, height: 56, borderRadius: 12,
                  background: team.color || 'var(--accent)', color: '#0a0e0c',
                  display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 24,
                }}
              >
                {team.name ? team.name.charAt(0).toUpperCase() : '?'}
              </div>
            )}
            <div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>{team.name || '(sans nom)'}</div>
              <div className="hint">{team.category}</div>
            </div>
          </div>
          <hr className="sep" style={{ margin: 0 }} />
          {team.contactName ? (
            <>
              <div>
                <div className="field-label">Nom du référent</div>
                <div style={{ fontSize: 15, fontWeight: 500, marginTop: 2 }}>{team.contactName}</div>
              </div>
              {team.contactPhone && (
                <div>
                  <div className="field-label">Téléphone</div>
                  <a
                    href={`tel:${team.contactPhone.replace(/\s/g, '')}`}
                    className="mono"
                    style={{ fontSize: 15, color: 'var(--accent)', textDecoration: 'none' }}
                  >
                    📞 {team.contactPhone}
                  </a>
                </div>
              )}
            </>
          ) : (
            <div className="hint">Aucun référent renseigné. Modifiable depuis l'onglet Setup.</div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span>🛠️</span>
          <h3>Administrateur course</h3>
        </div>
        <div className="card-body grid" style={{ gap: 12 }}>
          <div className="hint">À contacter en cas de problème pendant la course.</div>
          {event?.name && (
            <div>
              <div className="field-label">Événement</div>
              <div style={{ fontSize: 14, fontWeight: 500, marginTop: 2 }}>{event.name}</div>
            </div>
          )}
          {adminEmail ? (
            <div>
              <div className="field-label">Email</div>
              <a href={`mailto:${adminEmail}`} className="mono" style={{ fontSize: 14, color: 'var(--accent)', textDecoration: 'none' }}>
                ✉️ {adminEmail}
              </a>
            </div>
          ) : (
            <div className="hint">Aucun email admin renseigné.</div>
          )}
          {adminPhone && (
            <div>
              <div className="field-label">Téléphone</div>
              <a href={`tel:${adminPhone.replace(/\s/g, '')}`} className="mono" style={{ fontSize: 14, color: 'var(--accent)', textDecoration: 'none' }}>
                📞 {adminPhone}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
