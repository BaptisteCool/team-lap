// Mock Chronoplace API — replays the 294 laps recorded for HEROES ACADEMY during the
// 24h running 2026 race. When `event.testMode === true` AND `team.chronoplaceSlug ===
// 'heroes-academy'`, server actions in `chronoplace.ts` route through this mock instead
// of calling the real Chronoplace endpoint.
//
// Time compression: lap times AND reveal timings are divided by `TIME_DIVIDER` so a
// 24h race plays out in 6h. Enables fast end-to-end testing of the burst-poll chain
// without waiting for real lap durations.

import { MOCK_HEROES_ACADEMY_LAPS } from './mockChronoplaceData'

export const MOCK_SLUG = 'heroes-academy'
export const MOCK_EVENT_ID = 225
export const MOCK_TEAM_NAME = 'HEROES ACADEMY'

function fmtTempsHHMMSS(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export interface MockChronoplaceLap {
  id: number
  nom: string
  position_classement: string
  rang: number
  dossard: string
  nom_equipe: string
  nom_equipe_slug: string
  nom_coureur: string
  prenom_coureur: string
  temps: string
  ecart: string
  tours_plus_rapide: null
  nb_tours: number
  evenement_id: number
  type_classement_id: number
  created_at: string
  updated_at: string
}

// Build the mocked Chronoplace JSON response for HEROES ACADEMY.
// `actualStartMs` is the event's actualStart (epoch ms). `nowMs` is the current time
// against which reveal eligibility is evaluated. `timeDivider` compresses both lap
// durations and reveal timing (default 3 — passed by the caller from event timings).
export function buildMockHeroesAcademyResponse(
  actualStartMs: number,
  nowMs: number,
  timeDivider: number,
): MockChronoplaceLap[] {
  if (!actualStartMs || nowMs < actualStartMs) return []
  const divider = timeDivider > 0 ? timeDivider : 1
  const out: MockChronoplaceLap[] = []
  let cumulativeRealSec = 0
  for (let i = 0; i < MOCK_HEROES_ACADEMY_LAPS.length; i++) {
    const [chronoId, realTempsSec] = MOCK_HEROES_ACADEMY_LAPS[i]
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
      rang: 28,
      dossard: '8',
      nom_equipe: MOCK_TEAM_NAME,
      nom_equipe_slug: MOCK_SLUG,
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

// Decide whether a (slug, testMode) pair should be served by the mock.
export function shouldUseMockChronoplace(
  slug: string | undefined,
  testMode: boolean | undefined,
): boolean {
  return testMode === true && slug === MOCK_SLUG
}
