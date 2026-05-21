// Client-side demo simulation — pure functions, no Convex.
// Re-exports baked mock schedule from convex/lib for browser use.

export { computeSnapshotAt, type SnapshotLap } from '../../convex/lib/mockChronoplaceSchedule'

export type DemoTeam = {
  id: string
  name: string
  color: string
  chronoplaceSlug: string
}

export const DEMO_TEAMS: DemoTeam[] = [
  { id: 'heroes-academy', name: 'Heroes Academy', color: '#60D9F0', chronoplaceSlug: 'heroes-academy' },
  { id: "les-licornes-ca-n'existe-pas", name: "Les Licornes ça n'existe pas", color: '#F060A0', chronoplaceSlug: "les-licornes-ca-n'existe-pas" },
  { id: 'f2tards-endurants', name: 'F2tards Endurants', color: '#F0C040', chronoplaceSlug: 'f2tards-endurants' },
  { id: 'aiglehoux-et-compagnie', name: 'Aiglehoux et compagnie', color: '#80C0F0', chronoplaceSlug: 'aiglehoux-et-compagnie' },
]

export const DEMO_LAP_DISTANCE_M = 900
export const DEMO_FIRST_LAP_DISTANCE_M = 800
export const DEMO_RACE_DURATION_MS = 24 * 3600 * 1000
export const DEMO_TEST_DIVIDER = 3
