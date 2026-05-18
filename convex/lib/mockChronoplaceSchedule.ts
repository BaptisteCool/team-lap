// Mock Chronoplace schedule — maps each lap index (0..293) of MOCK_HEROES_ACADEMY_LAPS
// to the runner who actually crossed the line, based on the real Heroes Academy race
// rotation plan (with night-time group split + Pascal absentee coverage).
//
// Sequence built from the team's relais plan:
//   R1  full team, Pascal x13                = 53 laps  (cum  53)
//   R2  full team, Pascal x12                = 51 laps  (cum 104)
//   R3A night Groupe A (5 runners)           = 25 laps  (cum 129)
//   R4A night Groupe A                       = 22 laps  (cum 151)
//   R3B night Groupe B (4 runners)           = 24 laps  (cum 175)
//   R4B night Groupe B                       = 21 laps  (cum 196)
//   R5  full team back, Pascal x5            = 43 laps  (cum 239)
//   R6  full team, Pascal coupé court x3     = 41 laps  (cum 280)
//   R7  partial (Sim 5 + Martial 2 + Bapt 5 + Charlotte 2, ordre adapté) = 14 laps (cum 294)
//
// Total = 294 laps (matches MOCK_HEROES_ACADEMY_LAPS length).
//
// Use `getMockRunnerForLap(lapNumber)` (1-indexed) in applyChronoplaceLap mock branch
// to attribute the lap to the correct runner regardless of the runtime currentIdx.

type StintBlock = readonly [name: string, laps: number]

// Relais 1 — équipe complète, Pascal couvre un absent → 13 tours
const R1: StintBlock[] = [
  ['Simon', 6],
  ['Martial', 5],
  ['Charlotte', 4],
  ['Baptiste', 6],
  ['Marina', 4],
  ['Marc', 5],
  ['Théo', 6],
  ['Lucie', 4],
  ['Pascal', 13],
]

// Relais 2 — équipe complète, Simon descend à 5 (puis stable ensuite), Pascal 12
const R2: StintBlock[] = [
  ['Simon', 5],
  ['Martial', 5],
  ['Charlotte', 4],
  ['Baptiste', 6],
  ['Marina', 4],
  ['Marc', 5],
  ['Théo', 6],
  ['Lucie', 4],
  ['Pascal', 12],
]

// Relais 3 — Groupe A nuit (5 coureurs)
const R3_A: StintBlock[] = [
  ['Simon', 5],
  ['Martial', 5],
  ['Charlotte', 4],
  ['Baptiste', 7],
  ['Marina', 4],
]

// Relais 4 — Groupe A nuit
const R4_A: StintBlock[] = [
  ['Simon', 5],
  ['Martial', 4],
  ['Charlotte', 4],
  ['Baptiste', 5],
  ['Marina', 4],
]

// Relais 3 — Groupe B nuit (4 coureurs, Pascal x9 pour combler le manque)
const R3_B: StintBlock[] = [
  ['Marc', 5],
  ['Théo', 6],
  ['Lucie', 4],
  ['Pascal', 9],
]

// Relais 4 — Groupe B nuit
const R4_B: StintBlock[] = [
  ['Marc', 5],
  ['Théo', 6],
  ['Lucie', 5],
  ['Pascal', 5],
]

// Relais 5 — fusion équipe complète (reprise normale après nuit), Pascal x5
const R5: StintBlock[] = [
  ['Simon', 5],
  ['Martial', 5],
  ['Charlotte', 4],
  ['Baptiste', 6],
  ['Marina', 4],
  ['Marc', 5],
  ['Théo', 5],
  ['Lucie', 4],
  ['Pascal', 5],
]

// Relais 6 — équipe complète, Pascal coupé court (3 tours) car R7 démarre juste après
const R6: StintBlock[] = [
  ['Simon', 5],
  ['Martial', 5],
  ['Charlotte', 4],
  ['Baptiste', 6],
  ['Marina', 4],
  ['Marc', 5],
  ['Théo', 5],
  ['Lucie', 4],
  ['Pascal', 3],
]

// Relais 7 partiel — ordre modifié (Baptiste avant Charlotte), race ends mid-Charlotte
const R7_PARTIAL: StintBlock[] = [
  ['Simon', 5],
  ['Martial', 2],
  ['Baptiste', 5],
  ['Charlotte', 2],
]

function expand(blocks: StintBlock[][]): { runner: string; stintLen: number }[] {
  const out: { runner: string; stintLen: number }[] = []
  for (const relais of blocks) {
    for (const [name, laps] of relais) {
      for (let i = 0; i < laps; i++) {
        out.push({ runner: name, stintLen: laps })
      }
    }
  }
  return out
}

// Flat array, index 0 = lap 1, index 293 = lap 294
const SCHEDULE = expand([R1, R2, R3_A, R4_A, R3_B, R4_B, R5, R6, R7_PARTIAL])

export const MOCK_TOTAL_LAPS = SCHEDULE.length

// Get runner name for a Chronoplace lapNumber (1-indexed).
// Returns null if lapNumber is out of schedule range.
export function getMockRunnerForLap(lapNumber: number): string | null {
  const idx = lapNumber - 1
  if (idx < 0 || idx >= SCHEDULE.length) return null
  return SCHEDULE[idx].runner
}

// Stint length for a given lapNumber (= plannedAtStart for that lap).
export function getMockStintLengthForLap(lapNumber: number): number | null {
  const idx = lapNumber - 1
  if (idx < 0 || idx >= SCHEDULE.length) return null
  return SCHEDULE[idx].stintLen
}

// True if the lap at lapNumber is the LAST lap of its runner's stint
// (= relay event in mock). Detects by checking the next slot is different runner OR end.
export function isMockRelayLap(lapNumber: number): boolean {
  const idx = lapNumber - 1
  if (idx < 0 || idx >= SCHEDULE.length) return false
  const current = SCHEDULE[idx].runner
  const next = SCHEDULE[idx + 1]?.runner
  return next === undefined || next !== current
}
