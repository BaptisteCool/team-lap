// Mock Chronoplace API — replays the recorded laps for 4 teams of the 24h running 2026:
//   - LES LICORNES ÇA N'EXISTE PAS  (349 laps, vainqueurs)
//   - F2TARDS ENDURANTS              (295 laps)
//   - HEROES ACADEMY                 (294 laps) — test team principal avec schedule détaillé
//   - AIGLEHOUX ET COMPAGNIE         (293 laps)
//
// When `event.testMode === true` AND `team.chronoplaceSlug` matches one of these,
// server actions in `chronoplace.ts` route through this mock instead of calling
// the real Chronoplace endpoint.
//
// Time compression: lap times AND reveal timings are divided by `timeDivider` so a
// 24h race plays out in 24h/divider real-time.

import { MOCK_HEROES_ACADEMY_LAPS } from './mockChronoplace_28_8_heroes'
import { MOCK_F2TARDS_LAPS } from './mockChronoplace_27_7_f2tards'
import { MOCK_LICORNES_LAPS } from './mockChronoplace_1_26_licornes'
import { MOCK_AIGLEHOUX_LAPS } from './mockChronoplace_29_5_aiglehoux'
import type { ChronoplaceRawLap } from './chronoplaceTypes'
export type { ChronoplaceRawLap as MockChronoplaceLap } from './chronoplaceTypes'

export const MOCK_EVENT_ID = 225

export const HEROES_ACADEMY_SLUG = 'heroes-academy'
export const F2TARDS_SLUG = 'f2tards-endurants'
export const LICORNES_SLUG = "les-licornes-ca-n'existe-pas"
export const AIGLEHOUX_SLUG = 'aiglehoux-et-compagnie'

interface MockTeamConfig {
  slug: string
  name: string
  dossard: string
  rang: number
  laps: ReadonlyArray<readonly [number, number]>
}

const MOCK_TEAMS: Record<string, MockTeamConfig> = {
  [HEROES_ACADEMY_SLUG]: {
    slug: HEROES_ACADEMY_SLUG,
    name: 'HEROES ACADEMY',
    dossard: '8',
    rang: 28,
    laps: MOCK_HEROES_ACADEMY_LAPS,
  },
  [F2TARDS_SLUG]: {
    slug: F2TARDS_SLUG,
    name: 'F2TARDS ENDURANTS',
    dossard: '7',
    rang: 27,
    laps: MOCK_F2TARDS_LAPS,
  },
  [LICORNES_SLUG]: {
    slug: LICORNES_SLUG,
    name: "LES LICORNES ÇA N'EXISTE PAS",
    dossard: '26',
    rang: 1,
    laps: MOCK_LICORNES_LAPS,
  },
  [AIGLEHOUX_SLUG]: {
    slug: AIGLEHOUX_SLUG,
    name: 'AIGLEHOUX ET COMPAGNIE',
    dossard: '5',
    rang: 29,
    laps: MOCK_AIGLEHOUX_LAPS,
  },
}

function fmtTempsHHMMSS(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// Build the mocked Chronoplace JSON response for a given team slug.
// `actualStartMs` = event's actualStart (epoch ms). `nowMs` = current time evaluated against
// reveal eligibility. `timeDivider` compresses both lap durations and reveal cadence
// (default 3 — passed by caller from event timings).
export function buildMockChronoplaceResponse(
  slug: string,
  actualStartMs: number,
  nowMs: number,
  timeDivider: number,
): ChronoplaceRawLap[] {
  const config = MOCK_TEAMS[slug]
  if (!config) return []
  if (!actualStartMs || nowMs < actualStartMs) return []
  const divider = timeDivider > 0 ? timeDivider : 1
  const out: ChronoplaceRawLap[] = []
  let cumulativeRealSec = 0
  for (let i = 0; i < config.laps.length; i++) {
    const [chronoId, realTempsSec] = config.laps[i]
    cumulativeRealSec += realTempsSec
    const compressedTempsSec = realTempsSec / divider
    const revealAtMs = actualStartMs + (cumulativeRealSec * 1000) / divider
    if (revealAtMs > nowMs) break
    const lapNumber = i + 1
    const revealedIso = new Date(revealAtMs).toISOString().replace(/\.\d{3}Z$/, '.000000Z')
    out.push({
      id: chronoId,
      nom: 'Detail',
      position_classement: '1',
      rang: config.rang,
      dossard: config.dossard,
      nom_equipe: config.name,
      nom_equipe_slug: config.slug,
      nom_coureur: '',
      prenom_coureur: '',
      temps: fmtTempsHHMMSS(compressedTempsSec),
      ecart: '+0:00',
      tours_plus_rapide: null,
      nb_tours: lapNumber,
      evenement_id: MOCK_EVENT_ID,
      type_classement_id: 2,
      created_at: revealedIso,
      updated_at: revealedIso,
    })
  }
  return out
}

// Returns the (compressed) lapTime in ms for a given lap number (1-indexed) of the
// requested team. Used by applyChronoplaceLap to predict next lap's exact duration
// (since the race is already past in mock). Returns null if out of range.
export function getMockNextLapTimeMs(
  slug: string | undefined,
  nextLapNumber: number,
  timeDivider: number,
): number | null {
  if (!slug) return null
  const config = MOCK_TEAMS[slug]
  if (!config) return null
  const idx = nextLapNumber - 1
  if (idx < 0 || idx >= config.laps.length) return null
  const realSec = config.laps[idx][1]
  const divider = timeDivider > 0 ? timeDivider : 1
  return Math.round((realSec * 1000) / divider)
}

// Returns full mock lap metadata for direct insertion (skip polling burst).
// `revealAtMs` = absolute timestamp at which Chronoplace API exposes this lap
// (= actualStart + cumulativeRealSec / divider for laps 1..nextLapNumber).
// Returns null if out of range.
export function getMockLapMeta(
  slug: string | undefined,
  nextLapNumber: number,
  actualStartMs: number,
  timeDivider: number,
): { chronoplaceId: number; lapTimeMs: number; revealAtMs: number; rang: number } | null {
  if (!slug) return null
  const config = MOCK_TEAMS[slug]
  if (!config) return null
  const idx = nextLapNumber - 1
  if (idx < 0 || idx >= config.laps.length) return null
  const divider = timeDivider > 0 ? timeDivider : 1
  let cumulativeRealSec = 0
  for (let i = 0; i <= idx; i++) cumulativeRealSec += config.laps[i][1]
  const realSec = config.laps[idx][1]
  return {
    chronoplaceId: config.laps[idx][0],
    lapTimeMs: Math.round((realSec * 1000) / divider),
    revealAtMs: actualStartMs + Math.round((cumulativeRealSec * 1000) / divider),
    rang: config.rang,
  }
}

// Decide whether a (slug, testMode) pair should be served by the mock.
export function shouldUseMockChronoplace(
  slug: string | undefined,
  testMode: boolean | undefined,
): boolean {
  if (testMode !== true || !slug) return false
  return slug in MOCK_TEAMS
}

// Legacy alias for back-compat.
export const MOCK_SLUG = HEROES_ACADEMY_SLUG
export const MOCK_TEAM_NAME = 'HEROES ACADEMY'
export const buildMockHeroesAcademyResponse = (
  actualStartMs: number,
  nowMs: number,
  timeDivider: number,
) => buildMockChronoplaceResponse(HEROES_ACADEMY_SLUG, actualStartMs, nowMs, timeDivider)
