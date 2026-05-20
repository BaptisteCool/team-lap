import { createFileRoute } from '@tanstack/react-router'
import { SuperAdminGate } from '../components/admin/SuperAdminGate'

export const Route = createFileRoute('/super-admin')({
  component: SuperAdminPage,
})

function SuperAdminPage() {
  return (
    <SuperAdminGate>
      <div className="page">
        <div className="grid" style={{ gap: 18, maxWidth: 640, margin: '0 auto', paddingTop: 48 }}>
          <div className="card">
            <div className="card-head">
              <h2>Super Admin Dashboard</h2>
            </div>
            <div className="card-body" style={{ gap: 12 }}>
              <p className="hint">Listing des events à venir (split C).</p>
              <p className="hint">Création d'event à venir (split D).</p>
            </div>
          </div>
        </div>
      </div>
    </SuperAdminGate>
  )
}
