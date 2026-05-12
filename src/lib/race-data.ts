// Race data utilities

// Format milliseconds to HH:MM:SS
export function fmtClock(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

// Convert km pace (min/km) to lap time in milliseconds
export function kmPaceToLapMs(kmMin: number, kmSec: number, lapDistanceM = 900): number {
  const paceSeconds = kmMin * 60 + kmSec
  const lapSeconds = (paceSeconds * lapDistanceM) / 1000
  return Math.round(lapSeconds * 1000)
}

// GPX path for "24H Running - Brette-les-Pins"
export const GPX_PATH = "M99 121 L97.2 132.4 L96.3 143.5 L103.7 149.0 L121.4 149.0 L140.9 156.0 L156.7 158.7 L172.6 164.3 L183.7 167.1 L185.6 189.3 L182.8 204.5 L177.2 218.4 L174.4 232.3 L166.0 239.2 L143.7 239.2 L118.6 232.3 L100.9 228.1 L79.5 224.0 L63.7 219.8 L56.3 217.0 L49.8 218.4 L20.0 167.1 L35.8 137.9 L53.5 112.9 L80.5 75.5 L100.0 50.5 L128.8 40.8 L142.8 40.8 L159.5 46.3 L188.4 61.6 L222.8 83.8 L248.8 94.9 L270.2 107.4 L289.8 112.9 L311.2 115.7 L329.8 115.7 L346.5 111.5 L357.7 108.8 L371.6 108.8 L380.0 124.0 L379.1 136.5 L377.2 151.8 L363.3 154.6 L354.9 143.5 L347.4 135.1 L331.6 149.0 L314.0 153.2 L283.3 147.6 L264.7 140.7 L244.2 133.8 L220.0 129.6 L199.5 119.9 L175.3 110.2 L150.2 100.4 L127.0 94.9 L107.4 94.9 L100.9 110.2 Z"

export const GPX_VIEWBOX = "0 0 400 280"

// Lap distance in meters
export const LAP_DISTANCE_M = 900
export const LAP_DISTANCE_M_MEASURED = 934

// Energy levels
export const ENERGY_LEVELS = [
  { value: 100, label: 'Au top',         color: 'oklch(0.86 0.20 135)', short: '100%' },
  { value: 50,  label: 'Un peu diminué', color: 'oklch(0.82 0.17 70)',  short: '50%'  },
  { value: 25,  label: 'Très diminué',   color: 'oklch(0.72 0.21 25)',  short: '25%'  },
] as const

// Runner statuses
export const STATUSES = [
  { value: 'ready',     label: 'Prêt à courir', short: 'Prêt',     color: 'oklch(0.86 0.20 135)', icon: 'Check' },
  { value: 'uncertain', label: 'Incertain',     short: 'Incertain',color: 'oklch(0.82 0.17 70)',  icon: 'HelpCircle' },
  { value: 'out',       label: 'Abandon',       short: 'Abandon',  color: 'oklch(0.72 0.21 25)',  icon: 'XCircle' },
] as const

// Runner palette
export const RUNNER_PALETTE = ['#A6F060', '#60D9F0', '#F0A860', '#D060F0', '#F06080', '#F0E060', '#80F0C8', '#F08060', '#A080F0', '#F0C040']

// Default planned laps
export const DEFAULT_PLANNED_LAPS = 4

// Default runners
export const DEFAULT_RUNNERS = [
  { id: 'r1', name: 'Lulu',      kmMin: 6, kmSec: 0,  energy: 100, status: 'ready',     plannedLaps: DEFAULT_PLANNED_LAPS, color: RUNNER_PALETTE[0], liveKmMin: null as number | null, liveKmSec: null as number | null },
  { id: 'r2', name: 'Pascal',    kmMin: 4, kmSec: 15, energy: 100, status: 'ready',     plannedLaps: DEFAULT_PLANNED_LAPS, color: RUNNER_PALETTE[1], liveKmMin: null as number | null, liveKmSec: null as number | null },
  { id: 'r3', name: 'Baco',      kmMin: 4, kmSec: 45, energy: 100, status: 'ready',     plannedLaps: DEFAULT_PLANNED_LAPS, color: RUNNER_PALETTE[2], liveKmMin: null as number | null, liveKmSec: null as number | null },
  { id: 'r4', name: 'Klempic',   kmMin: 5, kmSec: 30, energy: 100, status: 'ready',     plannedLaps: DEFAULT_PLANNED_LAPS, color: RUNNER_PALETTE[3], liveKmMin: null as number | null, liveKmSec: null as number | null },
  { id: 'r5', name: 'Charlotte', kmMin: 6, kmSec: 0,  energy: 100, status: 'ready',     plannedLaps: DEFAULT_PLANNED_LAPS, color: RUNNER_PALETTE[4], liveKmMin: null as number | null, liveKmSec: null as number | null },
  { id: 'r6', name: 'Toto',      kmMin: 4, kmSec: 45, energy: 100, status: 'ready',     plannedLaps: DEFAULT_PLANNED_LAPS, color: RUNNER_PALETTE[5], liveKmMin: null as number | null, liveKmSec: null as number | null },
]

// Team color palette
export const TEAM_COLOR_PALETTE = [
  '#A6F060', '#60D9F0', '#F0A860', '#D060F0', '#F06080',
  '#F0E060', '#80F0C8', '#F08060', '#A080F0', '#F0C040'
]

// Team categories
export const TEAM_CATEGORIES = ['Hommes', 'Mixte', 'Femmes'] as const

// Default admin password
export const DEFAULT_ADMIN_PASSWORD = 'azerty2026'

// Super admin PIN
export const SUPER_ADMIN_PIN = '080687'

// Estimate where a team is on the track right now (0..1 along path)
export function computeTeamProgress(
  team: any,
  raceStarted: boolean,
  raceStartTime: number | null,
  now: number,
  kmPaceToLapMsFn: typeof kmPaceToLapMs
): number {
  if (!raceStarted || !raceStartTime) return 0
  const laps = team.laps || []
  const order = team.order || []
  const runners = team.runners || []
  if (order.length === 0) return 0
  
  const lastLapAt = laps.length ? laps[laps.length - 1].timestamp : raceStartTime
  const currentRunnerId = order[(team.currentIdx || 0) % order.length]
  const runner = runners.find((r: any) => r.id === currentRunnerId)
  if (!runner) return 0
  
  const lastLap = laps.length ? laps[laps.length - 1] : null
  let expectedLapMs: number
  
  if (runner.liveKmMin != null) {
    expectedLapMs = kmPaceToLapMsFn(runner.liveKmMin, runner.liveKmSec)
  } else if (lastLap && lastLap.runnerId === runner.id) {
    expectedLapMs = lastLap.lapTime
  } else {
    expectedLapMs = kmPaceToLapMsFn(runner.kmMin, runner.kmSec)
  }
  
  if (!expectedLapMs || expectedLapMs <= 0) return 0
  
  const elapsed = Math.max(0, now - lastLapAt)
  return elapsed / expectedLapMs
}

// Format time to HH:MM
export function fmtTime(ms: number): string {
  if (!ms) return '—'
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Format datetime-local from timestamp
export function toLocalDatetime(ms: number | null): string {
  if (!ms) return ''
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Empty team slice
export function emptyTeamSlice() {
  return {
    info: {
      id: '',
      name: '',
      maxRunners: 6,
      pin: '0000',
      category: 'Mixte',
      goalLaps: 200,
      color: TEAM_COLOR_PALETTE[0],
    },
    runners: [],
    order: [],
    laps: [],
    currentIdx: 0,
    ranking: { position: 1, gapPrev: '', gapNext: '', history: [] },
  }
}

// Admin state type
export interface AdminState {
  schedule: { startISO: string; endISO: string }
  race: { started: boolean; startTime: number | null }
  interruptions: any[]
  password: string
  contact: { email: string; phone: string }
}

// Default admin state
export function defaultAdminState(): AdminState {
  return {
    schedule: { startISO: '2026-05-16T15:00', endISO: '2026-05-17T15:00' },
    race: { started: false, startTime: null },
    interruptions: [],
    password: DEFAULT_ADMIN_PASSWORD,
    contact: { email: '', phone: '' },
  }
}
