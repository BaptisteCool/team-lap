import { Link } from '@tanstack/react-router'

interface EventNotFoundProps {
  slug?: string
}

export function EventNotFound({ slug }: EventNotFoundProps) {
  return (
    <div className="page">
      <div className="grid" style={{ gap: 18, maxWidth: 480, margin: '0 auto', paddingTop: 48 }}>
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '32px 24px' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>404</div>
            <h2 style={{ marginBottom: 8 }}>Event introuvable</h2>
            {slug && (
              <p className="hint" style={{ marginBottom: 16 }}>
                L'event <span className="mono">"{slug}"</span> n'existe pas ou n'est plus disponible.
              </p>
            )}
            <Link to="/" className="btn primary">
              Retour à l'accueil
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
