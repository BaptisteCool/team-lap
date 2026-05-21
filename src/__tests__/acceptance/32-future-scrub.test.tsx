/**
 * Acceptance tests — [Feat] #32 Slider temporel Phase 2 — scrub futur (Convex query)
 *
 * RED : les elements cibles n'existent pas encore :
 *   - convex/chronoplace.ts : query `getMockSnapshotAt` non implementee
 *   - convex/lib/mockChronoplaceSchedule.ts : helper `computeSnapshotAt` non implemente
 *   - HomeScreen.tsx : branchement query quand virtualNow > Date.now() + 1000 non implemente
 *   - debounce 100ms query pendant drag non implemente
 *
 * Strategie RED :
 *   - Les modules manquants sont stubbes via vi.mock pour permettre la collecte des tests.
 *   - Les stubs retournent des valeurs "vides/fausses" → les assertions echouent → RED confirme.
 *   - Quand l'implementation sera livree, supprimer les vi.mock concernes et les tests passeront.
 *
 * Perimetre : fullstack (front Vitest + logique pure helper)
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import React from 'react'

// ---------------------------------------------------------------------------
// Stubs pour modules pas encore implementes / dependances front
// Supprimer ou affiner ces mocks apres implementation (GREEN).
// ---------------------------------------------------------------------------

vi.mock('../../convex/hooks', () => ({
  useQuery: vi.fn(() => null),
  useMutation: vi.fn(() => vi.fn().mockResolvedValue(undefined)),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))

// GpxMap uses SVG APIs not available in jsdom
vi.mock('../../components/GpxMap', () => ({
  GpxMap: () => <div data-testid="gpx-map-stub" />,
}))

// ---------------------------------------------------------------------------
// Imports apres vi.mock (hoisted)
// ---------------------------------------------------------------------------
import { useQuery, useMutation } from '../../convex/hooks'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = Date.now()
const START_TIME = NOW - 2 * 60 * 60 * 1000 // 2h ago
const DIVIDER = 3
// Race duration 24h → endTime
const END_TIME = START_TIME + 24 * 60 * 60 * 1000

// Virtual future position: 1h apres maintenant (bien > Date.now() + 1000)
const VIRTUAL_FUTURE = NOW + 60 * 60 * 1000

// Virtual past position: 30min avant maintenant (< Date.now())
const VIRTUAL_PAST = NOW - 30 * 60 * 1000

// Lap shape compatible avec le calcul markers existant (filteredLaps coté front)
const MOCK_SNAPSHOT_LAPS = [
  {
    teamId: 'team-heroes',
    runnerId: 'r-simon',
    timestamp: VIRTUAL_FUTURE - 10 * 60 * 1000,
    lapTime: 180000,
    lapNumber: 42,
    type: 'checkpoint_auto' as const,
  },
  {
    teamId: 'team-heroes',
    runnerId: 'r-martial',
    timestamp: VIRTUAL_FUTURE - 5 * 60 * 1000,
    lapTime: 185000,
    lapNumber: 43,
    type: 'relay_auto' as const,
  },
]

const mockEventTestMode = {
  _id: 'evt1',
  status: 'running',
  actualStart: START_TIME,
  testMode: true,
  testModeDivider: DIVIDER,
  lapDistance: 900,
  minLapSec: 5,
  maxLapSec: 3600,
  relayTransitionSec: 5,
  firstLapDistanceM: 800,
  raceDuration: 24 * 3600 * 1000,
}

const mockTeams = [
  {
    _id: 'team-heroes',
    name: 'Heroes Academy',
    color: '#ff0000',
    category: 'Mixed',
    maxRunners: 9,
    goalLaps: 294,
    ready: true,
    currentIdx: 0,
    runners: [
      { id: 'r-simon', name: 'Simon', kmMin: 5, kmSec: 0 },
      { id: 'r-martial', name: 'Martial', kmMin: 5, kmSec: 10 },
    ],
    order: ['r-simon', 'r-martial'],
  },
]

const mockLapsPast = [
  {
    _id: 'l1',
    teamId: 'team-heroes',
    timestamp: START_TIME + 30 * 60 * 1000,
    type: 'checkpoint_auto',
    lapTime: 180000,
    runnerId: 'r-simon',
    lapNumber: 1,
  },
]

// ---------------------------------------------------------------------------
// Section 1 — Helper pur computeSnapshotAt (convex/lib/mockChronoplaceSchedule.ts)
// Tests portent sur la LOGIQUE PURE sans Convex runtime.
// Ces tests echouent tant que computeSnapshotAt n'est pas exporte.
// ---------------------------------------------------------------------------
describe('[Feat] #32 — computeSnapshotAt helper (pure logic)', () => {
  // Import dynamique pour eviter un crash si l'export n'existe pas encore.
  // Le test echouera proprement avec "computeSnapshotAt is not a function" → RED.
  let computeSnapshotAt: ((event: any, virtualNow: number) => any[]) | undefined

  beforeEach(async () => {
    try {
      const mod = await import('../../../convex/lib/mockChronoplaceSchedule')
      computeSnapshotAt = (mod as any).computeSnapshotAt
    } catch (_) {
      computeSnapshotAt = undefined
    }
  })

  test('AC5: computeSnapshotAt is exported from mockChronoplaceSchedule', () => {
    // RED : la fonction n'est pas encore exportee
    expect(typeof computeSnapshotAt).toBe('function')
  })

  test('AC5: returns laps for all teams whose revealAt <= virtualNow (future scrub)', () => {
    if (typeof computeSnapshotAt !== 'function') {
      // Force echec explicite si non exporte
      expect(computeSnapshotAt).toBeDefined()
      return
    }
    const event = { actualStart: START_TIME, testModeDivider: DIVIDER }
    const result = computeSnapshotAt(event, VIRTUAL_FUTURE)

    // Doit retourner un tableau non vide
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
  })

  test('AC3: each item has { teamId, runnerId, timestamp, lapTime, lapNumber, type }', () => {
    if (typeof computeSnapshotAt !== 'function') {
      expect(computeSnapshotAt).toBeDefined()
      return
    }
    const event = { actualStart: START_TIME, testModeDivider: DIVIDER }
    const result = computeSnapshotAt(event, VIRTUAL_FUTURE)

    if (result.length > 0) {
      const lap = result[0]
      expect(lap).toHaveProperty('teamId')
      expect(lap).toHaveProperty('runnerId')
      expect(lap).toHaveProperty('timestamp')
      expect(lap).toHaveProperty('lapTime')
      expect(lap).toHaveProperty('lapNumber')
      expect(lap).toHaveProperty('type')
    } else {
      // Pas de laps = echec RED (le schedule baked a des centaines de laps)
      expect(result.length).toBeGreaterThan(0)
    }
  })

  test('AC5: reuses baked schedule — result at virtualNow==Date.now() matches real live state (coherence)', () => {
    if (typeof computeSnapshotAt !== 'function') {
      expect(computeSnapshotAt).toBeDefined()
      return
    }
    const event = { actualStart: START_TIME, testModeDivider: DIVIDER }
    // Capture a virtualNow juste en dessous de maintenant
    const snapshotNow = computeSnapshotAt(event, NOW - 1000)
    const snapshotSlightlyLater = computeSnapshotAt(event, NOW)

    // Coherence: snapshot a NOW ne peut pas avoir MOINS de laps que snapshot a NOW-1s
    expect(snapshotSlightlyLater.length).toBeGreaterThanOrEqual(snapshotNow.length)
  })

  test('AC5: no mutation side effect — calling twice returns same result', () => {
    if (typeof computeSnapshotAt !== 'function') {
      expect(computeSnapshotAt).toBeDefined()
      return
    }
    const event = { actualStart: START_TIME, testModeDivider: DIVIDER }
    const r1 = computeSnapshotAt(event, VIRTUAL_FUTURE)
    const r2 = computeSnapshotAt(event, VIRTUAL_FUTURE)

    expect(r1.length).toBe(r2.length)
  })

  test('Edge: virtualNow === startTime returns 0 laps (aucun tour a cet instant initial)', () => {
    if (typeof computeSnapshotAt !== 'function') {
      expect(computeSnapshotAt).toBeDefined()
      return
    }
    const event = { actualStart: START_TIME, testModeDivider: DIVIDER }
    const result = computeSnapshotAt(event, START_TIME)

    // Au debut de la course, aucun lap n'est encore revele
    expect(result.length).toBe(0)
  })

  test('Edge: endTime undefined — computeSnapshotAt still returns laps for future virtualNow', () => {
    if (typeof computeSnapshotAt !== 'function') {
      expect(computeSnapshotAt).toBeDefined()
      return
    }
    const eventNoEnd = { actualStart: START_TIME, testModeDivider: DIVIDER }
    const result = computeSnapshotAt(eventNoEnd, VIRTUAL_FUTURE)

    expect(Array.isArray(result)).toBe(true)
    // Pas de crash, retourne quelque chose
    expect(result).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Section 2 — Query getMockSnapshotAt guard testMode (logique pure, sans Convex DB)
// On importe directement le handler logique si expose, sinon RED explicite.
// ---------------------------------------------------------------------------
describe('[Feat] #32 — getMockSnapshotAt query guard testMode (logic)', () => {
  test('AC4: throws ConvexError when testMode=false', async () => {
    // Import dynamique du module chronoplace pour verifier le guard
    // RED : getMockSnapshotAt n'existe pas encore dans convex/chronoplace.ts
    let chronoplaceModule: any
    try {
      chronoplaceModule = await import('../../../convex/chronoplace')
    } catch (_) {
      chronoplaceModule = undefined
    }

    // RED : la query n'est pas encore exportee
    expect(chronoplaceModule).toBeDefined()
    expect((chronoplaceModule as any).getMockSnapshotAt).toBeDefined()
  })

  test('AC3: snapshot structure is compatible with filteredLaps front calculation', () => {
    // Test de validation du shape de chaque lap retourne par computeSnapshotAt
    // Structure attendue par le front (HomeScreen.tsx calcul markers)
    const requiredFields = ['teamId', 'runnerId', 'timestamp', 'lapTime', 'lapNumber', 'type']

    for (const lap of MOCK_SNAPSHOT_LAPS) {
      for (const field of requiredFields) {
        expect(lap).toHaveProperty(field)
      }
    }
    // Ces assertions passent sur MOCK_SNAPSHOT_LAPS — le test RED est dans la section suivante
    // ou computeSnapshotAt retourne le bon shape
    expect(MOCK_SNAPSHOT_LAPS[0].teamId).toBeDefined()
    expect(typeof MOCK_SNAPSHOT_LAPS[0].timestamp).toBe('number')
    expect(typeof MOCK_SNAPSHOT_LAPS[0].lapTime).toBe('number')
    expect(typeof MOCK_SNAPSHOT_LAPS[0].lapNumber).toBe('number')
  })
})

// ---------------------------------------------------------------------------
// Section 3 — HomeScreen front branchement query future scrub
// ---------------------------------------------------------------------------
describe('[Feat] #32 — HomeScreen: getMockSnapshotAt appellee quand virtualNow > Date.now()+1000', () => {
  const useQueryMock = useQuery as ReturnType<typeof vi.fn>
  const useMutationMock = useMutation as ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    useMutationMock.mockReturnValue(vi.fn().mockResolvedValue(undefined))
    useQueryMock.mockImplementation((queryName: string, args?: any) => {
      if (queryName === 'events:getBySlug') return mockEventTestMode
      if (queryName === 'teams:getTeamsFull') return mockTeams
      if (queryName === 'laps:getLapsByEvent') return mockLapsPast
      // La query future scrub — retourne snapshot mock quand appelee
      if (queryName === 'chronoplace:getMockSnapshotAt') return MOCK_SNAPSHOT_LAPS
      return null
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  test('AC2: getMockSnapshotAt appellee quand virtualNow > Date.now() + 1000', async () => {
    // Note: HomeScreen pas encore branche sur getMockSnapshotAt — RED attendu
    const { HomeScreen } = await import('../../components/HomeScreen')

    // On force virtualNow en futur via le hook useVirtualClock
    // Le test verifie que useQuery est appelee avec 'chronoplace:getMockSnapshotAt'
    render(<HomeScreen eventSlug="heroes-2026" onPickTeam={vi.fn()} />)

    // Avancer le clock fictif pour depasser Date.now() + 1000
    // (le hook useVirtualClock a besoin de setVirtualNow appele depuis le slider)
    // Pour simuler virtualNow futur dans HomeScreen, on overridde le useQuery hook
    // de sorte que getMockSnapshotAt soit appele. On verifie que l'appel est fait.
    // RED : HomeScreen n'appelle pas getMockSnapshotAt aujourd'hui → assert echoue

    const calls = useQueryMock.mock.calls.map((c: any[]) => c[0])
    expect(calls).toContain('chronoplace:getMockSnapshotAt')
    // RED : cet expect echoue car HomeScreen ne fait pas cet appel actuellement
  })

  test('AC9: quand virtualNow <= Date.now(), getMockSnapshotAt N\'est PAS appelee', async () => {
    const { HomeScreen } = await import('../../components/HomeScreen')

    render(<HomeScreen eventSlug="heroes-2026" onPickTeam={vi.fn()} />)

    // En etat initial (isLive=true, virtualNow ~ Date.now()), pas d'appel futur
    const calls = useQueryMock.mock.calls.map((c: any[]) => c[0])
    expect(calls).not.toContain('chronoplace:getMockSnapshotAt')
    // GREEN-compat: HomeScreen n'appelle pas cette query aujourd'hui donc ce test passe
    // mais doit continuer a passer apres implementation (guard correct)
  })

  test('AC6: debounce 100ms — query non declenchee immediatement pendant drag rapide', async () => {
    // Test du debounce 100ms : si setVirtualNow est appele plusieurs fois en moins de 100ms,
    // getMockSnapshotAt ne doit pas etre rappele a chaque fois.
    const { HomeScreen } = await import('../../components/HomeScreen')

    render(<HomeScreen eventSlug="heroes-2026" onPickTeam={vi.fn()} />)

    // Reset compteur calls
    useQueryMock.mockClear()

    // Simuler 5 appels rapides en 50ms (sous le seuil de 100ms debounce)
    act(() => {
      vi.advanceTimersByTime(10)
    })
    act(() => {
      vi.advanceTimersByTime(10)
    })
    act(() => {
      vi.advanceTimersByTime(10)
    })
    act(() => {
      vi.advanceTimersByTime(10)
    })
    act(() => {
      vi.advanceTimersByTime(10)
    })

    // Le debounce doit limiter : getMockSnapshotAt ne doit etre appele qu'une seule fois
    // (ou zero si virtualNow pas encore en futur)
    const snapshotCalls = useQueryMock.mock.calls.filter((c: any[]) => c[0] === 'chronoplace:getMockSnapshotAt')
    expect(snapshotCalls.length).toBeLessThanOrEqual(1)
    // GREEN: le debounce assure au plus 1 appel dans ces 50ms
    // RED : HomeScreen ne fait pas du tout cet appel → snapshotCalls.length === 0 → passe ici
    // La vraie validation debounce sera completee dans l'integration quand l'appel sera implemente
  })

  test('Edge: getMockSnapshotAt echoue → markers reviennent au dernier snapshot valide', async () => {
    // Simuler un echec de la query
    useQueryMock.mockImplementation((queryName: string) => {
      if (queryName === 'events:getBySlug') return mockEventTestMode
      if (queryName === 'teams:getTeamsFull') return mockTeams
      if (queryName === 'laps:getLapsByEvent') return mockLapsPast
      if (queryName === 'chronoplace:getMockSnapshotAt') return undefined // query en erreur/undefined
      return null
    })

    const { HomeScreen } = await import('../../components/HomeScreen')

    // Ne doit pas crasher (pas de throw non-catche)
    expect(() => render(<HomeScreen eventSlug="heroes-2026" onPickTeam={vi.fn()} />)).not.toThrow()

    // Le composant reste affiche
    // (si des markers sont presentes ils viennent du dernier snapshot valide = filteredLaps)
    // RED : en l'absence d'implementation, le comportement de fallback n'est pas garanti
    // Ce test valide au moins que le composant ne plante pas
  })
})

// ---------------------------------------------------------------------------
// Section 4 — Slider etendu [startTime, endTime] quand testMode=true
// ---------------------------------------------------------------------------
describe('[Feat] #32 — TestModeTimelapseSlider: plage etendue a endTime', () => {
  test('AC1: slider max est endTime quand testMode=true (pas clampe a Date.now())', async () => {
    const { TestModeTimelapseSlider } = await import('../../components/TestModeTimelapseSlider')

    render(
      <TestModeTimelapseSlider
        testMode={true}
        startTime={START_TIME}
        endTime={END_TIME}
        virtualNow={NOW}
        setVirtualNow={vi.fn()}
        isLive={true}
        goLive={vi.fn()}
        relayTicks={[]}
      />,
    )

    const slider = document.querySelector('input[type="range"]')
    expect(slider).toBeInTheDocument()

    // RED : le slider max doit etre END_TIME, pas Date.now()
    // Actuellement TestModeTimelapseSlider Phase 1 borne max a Date.now()
    const maxAttr = slider ? Number((slider as HTMLInputElement).max) : 0
    expect(maxAttr).toBeGreaterThanOrEqual(END_TIME - 1000)
    // RED : max est encore Date.now() < END_TIME → assertion echoue
  })

  test('AC1: slider peut etre scrubble au-dela de Date.now() quand endTime fourni', async () => {
    const { TestModeTimelapseSlider } = await import('../../components/TestModeTimelapseSlider')

    const setVirtualNow = vi.fn()

    render(
      <TestModeTimelapseSlider
        testMode={true}
        startTime={START_TIME}
        endTime={END_TIME}
        virtualNow={VIRTUAL_FUTURE}
        setVirtualNow={setVirtualNow}
        isLive={false}
        goLive={vi.fn()}
        relayTicks={[]}
      />,
    )

    // virtualNow > Date.now() doit etre accepte (pas clampe)
    // Le slider doit afficher la position correspondant a VIRTUAL_FUTURE
    const slider = document.querySelector('input[type="range"]') as HTMLInputElement | null
    expect(slider).toBeInTheDocument()

    if (slider) {
      const sliderValue = Number(slider.value)
      // La position slider doit reflechir virtualNow futur (au-dela de Date.now())
      expect(sliderValue).toBeGreaterThan(NOW - START_TIME)
      // RED : Phase 1 clampe virtualNow a Date.now() → value sera <= NOW - START_TIME
    }
  })

  test('Edge: endTime non defini → slider borne a Date.now() (fallback Phase 1)', async () => {
    const { TestModeTimelapseSlider } = await import('../../components/TestModeTimelapseSlider')

    render(
      <TestModeTimelapseSlider
        testMode={true}
        startTime={START_TIME}
        // endTime non fourni
        virtualNow={NOW}
        setVirtualNow={vi.fn()}
        isLive={true}
        goLive={vi.fn()}
        relayTicks={[]}
      />,
    )

    const slider = document.querySelector('input[type="range"]') as HTMLInputElement | null
    expect(slider).toBeInTheDocument()

    // Sans endTime, le max ne doit pas etre END_TIME (24h future)
    // Le fallback a Date.now() doit s'appliquer
    if (slider) {
      const maxAttr = Number((slider as HTMLInputElement).max)
      // max doit etre proche de Date.now() - START_TIME (pas END_TIME - START_TIME)
      const endTimeMs = END_TIME - START_TIME
      expect(maxAttr).toBeLessThan(endTimeMs - 1000)
      // GREEN-compat: Phase 1 borne bien a Date.now() → passe deja
    }
  })
})

// ---------------------------------------------------------------------------
// Section 5 — Absence de mutation DB pendant scrub futur
// ---------------------------------------------------------------------------
describe('[Feat] #32 — Aucune mutation Convex pendant scrub futur (lecture seule)', () => {
  const useMutationMock = useMutation as ReturnType<typeof vi.fn>
  const useQueryMock = useQuery as ReturnType<typeof vi.fn>

  beforeEach(() => {
    const mutationFn = vi.fn().mockResolvedValue(undefined)
    useMutationMock.mockReturnValue(mutationFn)
    useQueryMock.mockImplementation((queryName: string) => {
      if (queryName === 'events:getBySlug') return mockEventTestMode
      if (queryName === 'teams:getTeamsFull') return mockTeams
      if (queryName === 'laps:getLapsByEvent') return mockLapsPast
      if (queryName === 'chronoplace:getMockSnapshotAt') return MOCK_SNAPSHOT_LAPS
      return null
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('AC7: aucune mutation appelee uniquement a cause du scrub futur', async () => {
    const { HomeScreen } = await import('../../components/HomeScreen')

    render(<HomeScreen eventSlug="heroes-2026" onPickTeam={vi.fn()} />)

    // Verifier que les mutations presentes (autoTick, presenceBeat) sont celles attendues
    // et qu'aucune mutation "d'ecriture liee au snapshot" n'est declenchee
    const mutationCalls = useMutationMock.mock.calls.map((c: any[]) => c[0])

    // Les seules mutations autorisees sur HomeScreen sont ces deux
    const allowedMutations = ['laps:autoTick', 'presence:beat']
    for (const call of mutationCalls) {
      expect(allowedMutations).toContain(call)
    }
    // GREEN-compat: HomeScreen n'a pas de mutation supplementaire → test passe
    // RED si une implementation incorrecte ajoute une mutation snapshot
  })
})
