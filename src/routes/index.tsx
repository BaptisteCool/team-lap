import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { HomeScreen } from '../components/HomeScreen'

export const Route = createFileRoute('/')({
  component: function Index() {
    const navigate = useNavigate()
    // Public access: navigate directly to team viewer (readonly). Manager mode
    // is unlocked from within /team/$id via login PIN dialog.
    const handlePickTeam = (teamId: string) => {
      navigate({ to: '/team/$teamId', params: { teamId }, search: { tab: 'planning', readonly: true } })
    }
    return <HomeScreen onPickTeam={handlePickTeam} />
  },
})
