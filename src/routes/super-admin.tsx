import { createFileRoute } from '@tanstack/react-router'
import { SuperAdminGate } from '../components/admin/SuperAdminGate'
import { AdminDashboard } from '../components/admin/AdminDashboard'

export const Route = createFileRoute('/super-admin')({
  component: SuperAdminPage,
})

function SuperAdminPage() {
  return (
    <SuperAdminGate>
      <AdminDashboard />
    </SuperAdminGate>
  )
}
