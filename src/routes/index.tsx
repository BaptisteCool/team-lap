import { createFileRoute } from '@tanstack/react-router'
import { HomeScreen } from '../components/HomeScreen'
import { DEFAULT_RUNNERS, TEAM_COLOR_PALETTE, emptyTeamSlice } from '../lib/race-data'

export const Route = createFileRoute('/')({
  component: function Index() {
    // Demo data - will be replaced with Convex data
    const teamsById = {
      'team_1': {
        ...emptyTeamSlice(),
        info: {
          ...emptyTeamSlice().info,
          id: 'team_1',
          name: 'Équipe Alpha',
          category: 'Mixte',
          color: TEAM_COLOR_PALETTE[0],
          ready: true,
        },
        runners: DEFAULT_RUNNERS.slice(0, 6),
        order: DEFAULT_RUNNERS.slice(0, 6).map(r => r.id),
        laps: [],
        currentIdx: 0,
      },
      'team_2': {
        ...emptyTeamSlice(),
        info: {
          ...emptyTeamSlice().info,
          id: 'team_2',
          name: 'Équipe Beta',
          category: 'Hommes',
          color: TEAM_COLOR_PALETTE[1],
          ready: true,
        },
        runners: DEFAULT_RUNNERS.slice(0, 6),
        order: DEFAULT_RUNNERS.slice(0, 6).map(r => r.id),
        laps: [],
        currentIdx: 0,
      },
    }

    const handlePickTeam = (teamId: string) => {
      console.log('Pick team:', teamId)
      // TODO: Navigate to team page
    }

    return (
      <HomeScreen
        teamsById={teamsById}
        onPickTeam={handlePickTeam}
        raceStarted={false}
        raceStartTime={null}
      />
    )
  },
})