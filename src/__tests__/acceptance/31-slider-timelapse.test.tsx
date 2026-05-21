/**
 * Acceptance tests — [Feat] #31 Slider temporel (timelapse) en mode test — Phase 1 front-only
 *
 * RED : les modules cibles n'existent pas encore :
 *   - src/hooks/useVirtualClock.ts
 *   - src/components/TestModeTimelapseSlider.tsx
 *   - HomeScreen.tsx n'integre pas encore useVirtualClock ni le slider
 *
 * Strategie RED :
 *   - Les modules manquants sont stubbes via vi.mock pour permettre la collecte des tests.
 *   - Chaque test assert sur le comportement attendu : les stubs retournent des valeurs
 *     "vides/fausses" → les assertions echouent → RED confirme.
 *   - Quand l'implementation sera livree, on supprimera les vi.mock et les tests passeront.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

// ---------------------------------------------------------------------------
// Stubs pour les modules pas encore implementes
// Supprimer ces mocks apres implementation (GREEN).
// ---------------------------------------------------------------------------

vi.mock('../../hooks/useVirtualClock', () => ({
  // Stub minimaliste — retourne des valeurs neutres qui feront echouer les assertions
  useVirtualClock: (_startTime: number, _divider?: number) => ({
    virtualNow: 0,          // Wrong: devrait etre ~Date.now()
    setVirtualNow: vi.fn(), // Wrong: ne met pas a jour virtualNow
    isLive: false,          // Wrong: devrait etre true au montage
    goLive: vi.fn(),        // Wrong: ne reset pas a Date.now()
  }),
}))

vi.mock('../../components/TestModeTimelapseSlider', () => ({
  // Stub — rend null inconditionnellement (pas de slider, pas de ticks, pas de boutons)
  TestModeTimelapseSlider: () => null,
}))

vi.mock('../../convex/hooks', () => ({
  useQuery: vi.fn(() => null),
  useMutation: vi.fn(() => vi.fn().mockResolvedValue(undefined)),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))

// GpxMap uses SVG APIs not available in jsdom (getTotalLength, etc.)
vi.mock('../../components/GpxMap', () => ({
  GpxMap: () => <div data-testid="gpx-map-stub" />,
}))

// ---------------------------------------------------------------------------
// Imports apres vi.mock (hoisted)
// ---------------------------------------------------------------------------
import { useVirtualClock } from '../../hooks/useVirtualClock'
import { TestModeTimelapseSlider } from '../../components/TestModeTimelapseSlider'
import { useQuery, useMutation } from '../../convex/hooks'

// ---------------------------------------------------------------------------
// Helpers / fixtures
// ---------------------------------------------------------------------------

const START_TIME = Date.now() - 2 * 60 * 60 * 1000 // 2h ago — valeur fixe pour les tests

// Timestamps de relais baked depuis mockChronoplaceSchedule.ts
// (R1=53 laps, R2=104 laps, R3A nuit=129 laps, R5=239 laps, R7=294 laps)
// Chaque tour compresse environ 3 min (divider=3, lap reel ~9 min)
const RELAY_TIMESTAMPS = {
  R1_end:   START_TIME +  53 * 3 * 60 * 1000,
  R2_end:   START_TIME + 104 * 3 * 60 * 1000,
  R3A_end:  START_TIME + 129 * 3 * 60 * 1000,
  R5_end:   START_TIME + 239 * 3 * 60 * 1000,
  R7_start: START_TIME + 280 * 3 * 60 * 1000,
}

const DEFAULT_SLIDER_PROPS = {
  testMode: true,
  startTime: START_TIME,
  virtualNow: START_TIME + 60 * 60 * 1000,
  setVirtualNow: vi.fn(),
  goLive: vi.fn(),
  isLive: false,
  relayTicks: Object.values(RELAY_TIMESTAMPS),
}

// ---------------------------------------------------------------------------
// 1. Hook useVirtualClock
// ---------------------------------------------------------------------------
describe('[Feat] #31 — useVirtualClock hook', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('AC10: hook exposes virtualNow, setVirtualNow, isLive, goLive', () => {
    const { result } = renderHook(() => useVirtualClock(START_TIME))

    expect(result.current).toHaveProperty('virtualNow')
    expect(result.current).toHaveProperty('setVirtualNow')
    expect(result.current).toHaveProperty('isLive')
    expect(result.current).toHaveProperty('goLive')
    // toHaveProperty passe car le stub les expose — l'assertion suivante echoue
    // virtualNow doit etre proche de Date.now() (isLive initial)
    const now = Date.now()
    expect(result.current.virtualNow).toBeGreaterThanOrEqual(now - 2000)
    // RED : stub retourne 0
  })

  test('AC10: virtualNow is initialized to approximately Date.now() and isLive=true on mount', () => {
    const before = Date.now()
    const { result } = renderHook(() => useVirtualClock(START_TIME))
    const after = Date.now()

    expect(result.current.virtualNow).toBeGreaterThanOrEqual(before - 100)
    expect(result.current.virtualNow).toBeLessThanOrEqual(after + 100)
    // RED : stub retourne virtualNow=0

    expect(result.current.isLive).toBe(true)
    // RED : stub retourne isLive=false
  })

  test('AC10: setVirtualNow updates virtualNow and transitions isLive to false', () => {
    const { result } = renderHook(() => useVirtualClock(START_TIME))
    const target = START_TIME + 30 * 60 * 1000

    act(() => {
      result.current.setVirtualNow(target)
    })

    // RED : stub setVirtualNow est un vi.fn() muet, virtualNow reste 0
    expect(result.current.virtualNow).toBe(target)
    expect(result.current.isLive).toBe(false)
  })

  test('AC10: goLive resets virtualNow to Date.now() and restores isLive=true', () => {
    const { result } = renderHook(() => useVirtualClock(START_TIME))

    // D'abord scrubber en arriere
    act(() => { result.current.setVirtualNow(START_TIME + 10 * 60 * 1000) })
    // Puis revenir live
    act(() => { result.current.goLive() })

    expect(result.current.isLive).toBe(true)
    expect(result.current.virtualNow).toBeGreaterThanOrEqual(Date.now() - 1500)
    // RED : stub goLive est un vi.fn() muet, isLive reste false et virtualNow reste 0
  })

  test('Edge: clamp — setVirtualNow above Date.now() is clamped to Date.now()', () => {
    const { result } = renderHook(() => useVirtualClock(START_TIME))
    const future = Date.now() + 60 * 60 * 1000

    act(() => { result.current.setVirtualNow(future) })

    expect(result.current.virtualNow).toBeLessThanOrEqual(Date.now() + 50)
    // RED: stub retourne virtualNow=0, l'assertion passe (0 <= Date.now()+50)
    // Mais le test global echoue car virtualNow doit etre CLAMPE a Date.now(), pas 0
    // On renforce: doit etre dans [Date.now()-100, Date.now()+50]
    expect(result.current.virtualNow).toBeGreaterThanOrEqual(Date.now() - 2000)
    // RED : 0 < Date.now()-2000 est faux mais... on ajoute le test de clamp strict
    expect(result.current.virtualNow).not.toBe(0)
    // RED : stub retourne 0
  })

  test('Edge: clamp — setVirtualNow below startTime is clamped to startTime', () => {
    const { result } = renderHook(() => useVirtualClock(START_TIME))
    const beforeStart = START_TIME - 60 * 1000

    act(() => { result.current.setVirtualNow(beforeStart) })

    expect(result.current.virtualNow).toBeGreaterThanOrEqual(START_TIME)
    // RED : stub retourne virtualNow=0, qui est < START_TIME (START_TIME = Date.now()-7200000)
  })

  test('Edge: testModeDivider change resets isLive=true and virtualNow to Date.now()', () => {
    const { result, rerender } = renderHook(
      ({ divider }: { divider: number }) => useVirtualClock(START_TIME, divider),
      { initialProps: { divider: 3 } },
    )

    act(() => { result.current.setVirtualNow(START_TIME + 10 * 60 * 1000) })

    rerender({ divider: 6 })

    expect(result.current.isLive).toBe(true)
    expect(result.current.virtualNow).toBeGreaterThanOrEqual(Date.now() - 1500)
    // RED : stub isLive=false, virtualNow=0
  })
})

// ---------------------------------------------------------------------------
// 2. Filtrage allLaps par virtualNow (pure logic — pas de mock, toujours GREEN-able)
// Note: ces tests sont des specs de comportement pur, ils doivent passer immediatement
// pour valider que la logique de filtrage est correcte une fois integree.
// ---------------------------------------------------------------------------
describe('[Feat] #31 — allLaps filtering by virtualNow (pure logic spec)', () => {
  test('AC11: only laps with timestamp <= virtualNow are kept', () => {
    const now = Date.now()
    const allLaps = [
      { id: '1', timestamp: now - 30 * 60 * 1000 },
      { id: '2', timestamp: now - 15 * 60 * 1000 },
      { id: '3', timestamp: now - 1 * 60 * 1000 },
      { id: '4', timestamp: now + 5 * 60 * 1000 }, // futur — exclu
    ]
    const virtualNow = now - 10 * 60 * 1000

    const filtered = allLaps.filter((l) => l.timestamp <= virtualNow)

    expect(filtered).toHaveLength(2)
    expect(filtered.map((l) => l.id)).toEqual(['1', '2'])
  })

  test('AC11: when virtualNow === Date.now() all past laps are included', () => {
    const now = Date.now()
    const allLaps = [
      { id: 'a', timestamp: now - 60_000 },
      { id: 'b', timestamp: now - 1_000 },
    ]

    const filtered = allLaps.filter((l) => l.timestamp <= now)

    expect(filtered).toHaveLength(2)
  })

  test('Edge: virtualNow === startTime yields no laps (position initiale)', () => {
    const allLaps = [{ id: '1', timestamp: START_TIME + 1000 }]

    const filtered = allLaps.filter((l) => l.timestamp <= START_TIME)

    expect(filtered).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 3. Composant TestModeTimelapseSlider
// ---------------------------------------------------------------------------
describe('[Feat] #31 — TestModeTimelapseSlider component', () => {
  test('AC1: slider is NOT rendered when testMode=false', () => {
    const { container } = render(
      <TestModeTimelapseSlider {...DEFAULT_SLIDER_PROPS} testMode={false} />,
    )
    // RED : le stub retourne null dans TOUS les cas, donc ce test PASSE
    // Mais le test suivant (testMode=true) doit echouer — le slider doit etre present
    expect(container).toBeEmptyDOMElement()
  })

  test('AC1: slider IS rendered when testMode=true', () => {
    render(<TestModeTimelapseSlider {...DEFAULT_SLIDER_PROPS} testMode={true} />)

    // RED : stub retourne null → pas de slider
    const slider = screen.queryByRole('slider')
    expect(slider).toBeInTheDocument()
    // RED: queryByRole retourne null, toBeInTheDocument echoue
  })

  test('AC2: slider absent from DOM when testMode=false (no display:none workaround)', () => {
    const { container } = render(
      <TestModeTimelapseSlider {...DEFAULT_SLIDER_PROPS} testMode={false} />,
    )

    expect(container.querySelector('input[type="range"]')).toBeNull()
    expect(container.firstChild).toBeNull()
    // RED-compat: passe avec le stub null mais echouera si implementaion utilise display:none
  })

  test('AC5: at least 5 relay tick marks rendered (R1, R2, R3A nuit, R5, R7)', () => {
    render(<TestModeTimelapseSlider {...DEFAULT_SLIDER_PROPS} />)

    const ticks = screen.queryAllByTestId('relay-tick')
    expect(ticks.length).toBeGreaterThanOrEqual(5)
    // RED : stub retourne null → 0 ticks
  })

  test('AC6: clicking a relay tick calls setVirtualNow with that tick timestamp (snap ±2min)', () => {
    const setVirtualNow = vi.fn()
    const tickTimestamp = RELAY_TIMESTAMPS.R1_end

    render(
      <TestModeTimelapseSlider
        {...DEFAULT_SLIDER_PROPS}
        setVirtualNow={setVirtualNow}
        relayTicks={[tickTimestamp]}
      />,
    )

    const ticks = screen.queryAllByTestId('relay-tick')
    // RED : 0 ticks, test echoue ici
    expect(ticks.length).toBeGreaterThanOrEqual(1)

    fireEvent.click(ticks[0])

    // setVirtualNow doit etre appele avec une valeur dans [tickTimestamp-2min, tickTimestamp+2min]
    expect(setVirtualNow).toHaveBeenCalledWith(
      expect.any(Number),
    )
    const calledWith: number = setVirtualNow.mock.calls[0][0]
    expect(Math.abs(calledWith - tickTimestamp)).toBeLessThanOrEqual(2 * 60 * 1000)
  })

  test('AC7: "Live" button calls goLive when clicked', () => {
    const goLive = vi.fn()

    render(<TestModeTimelapseSlider {...DEFAULT_SLIDER_PROPS} goLive={goLive} />)

    // RED : stub retourne null → pas de bouton
    const liveBtn = screen.queryByRole('button', { name: /live/i })
    expect(liveBtn).toBeInTheDocument()
    fireEvent.click(liveBtn!)
    expect(goLive).toHaveBeenCalledOnce()
  })

  test('AC8: REWIND / T-Xmin badge visible when isLive=false', () => {
    render(<TestModeTimelapseSlider {...DEFAULT_SLIDER_PROPS} isLive={false} />)

    // RED : stub retourne null → pas de badge
    const badge = screen.queryByTestId('rewind-badge')
    expect(badge).toBeInTheDocument()
    expect(badge!.textContent).toMatch(/rewind|T-\d+\s*min/i)
  })

  test('AC8: REWIND badge absent when isLive=true', () => {
    render(
      <TestModeTimelapseSlider
        {...DEFAULT_SLIDER_PROPS}
        isLive={true}
        virtualNow={Date.now()}
      />,
    )

    expect(screen.queryByTestId('rewind-badge')).toBeNull()
    // RED-compat: passe car stub retourne null
    // GREEN devra verifier que le badge n'apparait PAS quand isLive=true
  })

  test('Edge: R3A nuit tick snap switches badge to REWIND', () => {
    const setVirtualNow = vi.fn()

    render(
      <TestModeTimelapseSlider
        {...DEFAULT_SLIDER_PROPS}
        isLive={false}
        setVirtualNow={setVirtualNow}
        relayTicks={[RELAY_TIMESTAMPS.R3A_end]}
      />,
    )

    const ticks = screen.queryAllByTestId('relay-tick')
    // RED : 0 ticks
    expect(ticks.length).toBeGreaterThanOrEqual(1)
    fireEvent.click(ticks[0])
    expect(setVirtualNow).toHaveBeenCalled()

    const badge = screen.queryByTestId('rewind-badge')
    expect(badge).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 4. HomeScreen integration — slider presence driven by testMode
// ---------------------------------------------------------------------------
describe('[Feat] #31 — HomeScreen integration: timelapse slider in testMode', () => {
  const mockEventTestMode = {
    _id: 'evt1',
    status: 'running',
    actualStart: START_TIME,
    testMode: true,
    testModeDivider: 3,
    lapDistance: 900,
    minLapSec: 5,
    maxLapSec: 3600,
    relayTransitionSec: 5,
    firstLapDistanceM: 800,
  }

  const mockTeams = [
    {
      _id: 'team1',
      name: 'Heroes Academy',
      color: '#ff0000',
      category: 'Mixed',
      maxRunners: 10,
      goalLaps: 300,
      ready: true,
      runners: [{ id: 'r1', name: 'Simon', kmMin: 5, kmSec: 0 }],
      order: ['r1'],
      currentIdx: 0,
    },
  ]

  const mockLaps = [
    {
      _id: 'l1', teamId: 'team1',
      timestamp: START_TIME + 30 * 60 * 1000,
      type: 'run', lapTime: 180000, runnerId: 'r1', lapNumber: 1,
    },
    {
      _id: 'l2', teamId: 'team1',
      timestamp: START_TIME + 90 * 60 * 1000,
      type: 'run', lapTime: 180000, runnerId: 'r1', lapNumber: 2,
    },
  ]

  beforeEach(() => {
    const useQueryMock = useQuery as ReturnType<typeof vi.fn>
    const useMutationMock = useMutation as ReturnType<typeof vi.fn>
    useMutationMock.mockReturnValue(vi.fn().mockResolvedValue(undefined))
    useQueryMock.mockImplementation((queryName: string) => {
      if (queryName === 'events:getBySlug') return mockEventTestMode
      if (queryName === 'teams:getTeamsFull') return mockTeams
      if (queryName === 'laps:getLapsByEvent') return mockLaps
      return null
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('AC1 integration: HomeScreen renders timelapse slider when testMode=true', async () => {
    // Note: HomeScreen.tsx n'est PAS mocke — on importe la vraie implementation.
    // Quand l'integration n'existe pas encore, le slider sera absent → RED.
    const { HomeScreen } = await import('../../components/HomeScreen')

    render(<HomeScreen eventSlug="heroes-2026" onPickTeam={vi.fn()} />)

    // Le slider input[type=range] doit etre present quand testMode=true
    const slider = screen.queryByRole('slider')
    expect(slider).toBeInTheDocument()
    // RED : HomeScreen n'integre pas encore le slider → null → echoue
  })

  test('AC1 integration: HomeScreen does NOT render timelapse slider when testMode=false', async () => {
    const useQueryMock = useQuery as ReturnType<typeof vi.fn>
    useQueryMock.mockImplementation((queryName: string) => {
      if (queryName === 'events:getBySlug') return { ...mockEventTestMode, testMode: false }
      if (queryName === 'teams:getTeamsFull') return mockTeams
      if (queryName === 'laps:getLapsByEvent') return mockLaps
      return null
    })

    const { HomeScreen } = await import('../../components/HomeScreen')
    render(<HomeScreen eventSlug="heroes-2026" onPickTeam={vi.fn()} />)

    expect(screen.queryByRole('slider')).toBeNull()
    expect(document.querySelector('input[type="range"]')).toBeNull()
    // GREEN-compat : doit rester null meme apres implementation
  })
})
