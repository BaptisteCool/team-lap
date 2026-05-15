import { kmPaceToLapMs } from './race-data'

interface LapLike {
  _id?: string
  id?: string
  runnerId: string
  type: string
  lapTime: number
  timestamp: number
}

interface RunnerLike {
  id: string
  kmMin: number
  kmSec: number
}

const NEUTRAL_THRESHOLD_MS = 5_000

// Compute the EXPECTED lap time for a given lap, accounting for the relay transition penalty.
// Returns null if runner cannot be resolved (orphan lap).
export function computeLapExpectedMs(
  lap: LapLike,
  runner: RunnerLike | undefined,
  relayTransitionSec: number,
): number | null {
  if (!runner) return null
  const baseMs = kmPaceToLapMs(runner.kmMin, runner.kmSec)
  const isRelay = lap.type === 'relay_manual' || lap.type === 'relay_auto'
  return isRelay ? baseMs + relayTransitionSec * 1000 : baseMs
}

export interface TeamDelta {
  expectedMs: number
  actualMs: number
  deltaMs: number // positif = retard équipe, négatif = avance
  lastLapDeltaMs: number | null
  lapsCounted: number
}

// Cumulative team delta over all real laps (excludes type === 'position').
// Last lap delta is computed on the chronologically most-recent lap.
export function computeTeamDelta(
  laps: LapLike[],
  runners: RunnerLike[],
  relayTransitionSec: number,
): TeamDelta {
  const runnersById = new Map(runners.map((r) => [r.id, r]))
  let expected = 0
  let actual = 0
  let counted = 0
  let lastDelta: number | null = null
  // Sort chronologically asc to compute "last" reliably
  const sorted = [...laps]
    .filter((l) => l.type !== 'position')
    .sort((a, b) => a.timestamp - b.timestamp)
  for (const l of sorted) {
    const exp = computeLapExpectedMs(l, runnersById.get(l.runnerId), relayTransitionSec)
    if (exp == null) continue
    expected += exp
    actual += l.lapTime
    counted++
    lastDelta = l.lapTime - exp
  }
  return {
    expectedMs: expected,
    actualMs: actual,
    deltaMs: actual - expected,
    lastLapDeltaMs: lastDelta,
    lapsCounted: counted,
  }
}

// Format a signed duration in ms as ±MM:SS. Caps visual to ±99:59 if absolute > limit.
// Returns "0:00" for absolute deltas under 1s (treats as zero).
export function formatSignedDuration(ms: number): string {
  if (Math.abs(ms) < 1000) return '0:00'
  const sign = ms < 0 ? '-' : '+'
  const absSec = Math.floor(Math.abs(ms) / 1000)
  const cappedSec = Math.min(absSec, 99 * 60 + 59)
  const m = Math.floor(cappedSec / 60)
  const s = cappedSec % 60
  const overflowMark = absSec > cappedSec ? '>' : ''
  return `${overflowMark}${sign}${m}:${String(s).padStart(2, '0')}`
}

export type DeltaTone = 'positive' | 'negative' | 'neutral'

// positive = avance (delta négatif → équipe plus rapide que prévu)
// negative = retard (delta positif → équipe plus lente que prévu)
// neutral = ±5s
export function getDeltaTone(deltaMs: number): DeltaTone {
  if (Math.abs(deltaMs) <= NEUTRAL_THRESHOLD_MS) return 'neutral'
  return deltaMs < 0 ? 'positive' : 'negative'
}

export function deltaToneColor(tone: DeltaTone): string {
  if (tone === 'positive') return 'oklch(0.86 0.20 135)' // green
  if (tone === 'negative') return 'oklch(0.72 0.21 25)' // red
  return 'var(--muted)'
}
