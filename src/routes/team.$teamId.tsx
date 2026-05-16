import { createFileRoute, useNavigate } from '@tanstack/react-router'
import React, { useEffect, useRef, useState } from 'react'
import { ContactScreen } from '../components/ContactScreen'
import { HistoryScreen } from '../components/HistoryScreen'
import { LiveScreen } from '../components/LiveScreen'
import { PlanningScreen } from '../components/PlanningScreen'
import { SetupScreen } from '../components/SetupScreen'
import { Modal } from '../components/Modal'
import { useAction, useMutation, useQuery } from '../convex/hooks'
import { WeatherSourceDialog } from '../components/WeatherSourceDialog'
import { TestModeBadge } from '../components/TestModeBadge'
import {
  DEFAULT_PROVIDER as WEATHER_DEFAULT_PROVIDER,
  PROVIDERS as WEATHER_PROVIDERS,
  type ProviderId as WeatherProviderId,
  readPreferredProvider,
  writePreferredProvider,
} from '../lib/weather-providers'
import { DEFAULT_RUNNERS, estimateGoalLaps, RUNNER_PALETTE, TEAM_COLOR_PALETTE, emptyTeamSlice } from '../lib/race-data'

const EVENT_SLUG = '24h-brette-les-pins-2026'

type Tab = 'setup' | 'planning' | 'live' | 'history' | 'contact'

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'live', label: 'Live', icon: '🏃' },
  { id: 'planning', label: 'Planning', icon: '📋' },
  { id: 'history', label: 'Historique', icon: '📜' },
  { id: 'setup', label: 'Setup', icon: '⚙️' },
  { id: 'contact', label: 'Contact', icon: '📞' },
]

const VIEWER_TABS: Tab[] = ['planning', 'history']

const TAB_IDS = TABS.map((t) => t.id) as Tab[]

const teamUnlockKey = (teamId: string, pin: string) => `teamlap.team.${teamId}.pin.${pin}`

export const Route = createFileRoute('/team/$teamId')({
  component: TeamPage,
  validateSearch: (search: Record<string, unknown>) => {
    const t = search.tab as string | undefined
    return {
      tab: (TAB_IDS.includes(t as Tab) ? t : 'live') as Tab,
      readonly: search.readonly === true || search.readonly === 'true' || search.readonly === '1',
    }
  },
})

function TeamPage() {
  const { teamId } = Route.useParams()
  const { tab: rawTab, readonly } = Route.useSearch()
  const navigate = useNavigate()
  // Viewer mode: restrict tabs to planning + history only (force planning if invalid)
  const activeTab: Tab = readonly && !VIEWER_TABS.includes(rawTab) ? 'planning' : rawTab
  const setActiveTab = (next: Tab) => {
    const safe = readonly && !VIEWER_TABS.includes(next) ? 'planning' : next
    navigate({ to: '/team/$teamId', params: { teamId }, search: { tab: safe, readonly } })
  }
  const [loginOpen, setLoginOpen] = useState(false)
  const [loginPin, setLoginPin] = useState('')
  const [loginError, setLoginError] = useState(false)
  // Admin button visible only if admin PIN already validated on this device
  const isAdminUnlocked = (() => {
    try { return localStorage.getItem('teamlap.adminUnlocked') === '1' } catch (_) { return false }
  })()

  const event = useQuery('events:getBySlug' as any, { slug: EVENT_SLUG })
  const teamData = useQuery('teams:getTeam' as any, { teamId: teamId as any })
  const lapsData = useQuery('laps:getLaps' as any, { teamId: teamId as any }) as any[] | null | undefined

  const updateTeamMutation = useMutation('teams:updateTeam' as any)
  const recordLapMutation = useMutation('laps:recordLap' as any)
  const deleteLapMutation = useMutation('laps:deleteLap' as any)
  const updateLapMutation = useMutation('laps:updateLap' as any)
  const insertLapAtMutation = useMutation('laps:insertLapAt' as any)
  const addBulkRelayMutation = useMutation('laps:addBulkRelay' as any)
  const setTeamOrderMutation = useMutation('teams:setTeamOrder' as any)
  const upsertRunnerMutation = useMutation('teams:upsertRunner' as any)
  const deleteRunnerMutation = useMutation('teams:deleteRunner' as any)
  const setAutoPausedMutation = useMutation('teams:setAutoPaused' as any)
  const recordFinishMutation = useMutation('teams:recordFinish' as any)
  // Weather (multi-provider via Convex). User pref persisted in localStorage.
  const [weatherProvider, setWeatherProvider] = useState<WeatherProviderId>(() => readPreferredProvider())
  const [weatherDialogOpen, setWeatherDialogOpen] = useState(false)
  const weather = useQuery(
    'weather:getWeatherForEvent' as any,
    event?._id ? { eventId: event._id, provider: weatherProvider } : 'skip',
  ) as any
  const fetchWeatherAction = useAction('weather:fetchWeather' as any)
  // Trigger a refresh when cache is missing or stale (and we have lat/lng).
  React.useEffect(() => {
    if (!event?._id) return
    if ((event as any)?.latitude == null || (event as any)?.longitude == null) return
    if (weather === undefined) return
    if (weather === null || weather?.stale) {
      fetchWeatherAction({ eventId: event._id, provider: weatherProvider }).catch((err: any) =>
        console.warn('weather fetch failed', err),
      )
    }
  }, [
    event?._id,
    (event as any)?.latitude,
    (event as any)?.longitude,
    weather === null,
    weather?.stale,
    weatherProvider,
  ])
  const weatherProviderLabel = WEATHER_PROVIDERS.find((p) => p.id === weatherProvider)?.label ?? WEATHER_DEFAULT_PROVIDER
  const setRunnerGroupMutation = useMutation('teams:setRunnerGroup' as any)
  const enqueueGroupModeMutation = useMutation('teams:enqueueGroupMode' as any)
  const cancelGroupModeEntryMutation = useMutation('teams:cancelGroupModeEntry' as any)
  const stopActiveGroupModeMutation = useMutation('teams:stopActiveGroupMode' as any)
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const orderTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [team, setTeam] = useState<any>({
    ...emptyTeamSlice().info,
    id: teamId,
    name: '',
    maxRunners: 6,
    pin: '0000',
    category: 'Mixte',
    goalLaps: 200,
    color: TEAM_COLOR_PALETTE[0],
    ready: false,
  })
  const [runners, setRunners] = useState<any>(DEFAULT_RUNNERS.slice(0, 6))
  const [order, setOrder] = useState<string[]>(DEFAULT_RUNNERS.slice(0, 6).map(r => r.id))
  // Toast notifications (used by LiveScreen for delta vs estimation, etc.)
  const [toasts, setToasts] = useState<Array<{ id: string; text: string; icon?: string; action?: { label: string; fn: () => void } }>>([])
  const pushToast = (text: string, icon?: string, action?: { label: string; fn: () => void }) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((s) => [...s, { id, text, icon, action }])
    setTimeout(() => setToasts((s) => s.filter((t) => t.id !== id)), action ? 6000 : 3000)
  }

  const [ranking, setRanking] = useState<{
    position: number
    totalTeams?: number
    gapPrevMin?: number
    gapPrevSec?: number
    gapNextMin?: number
    gapNextSec?: number
    history?: Array<{ t: number; pos: number }>
  }>({
    position: 1,
    gapPrevMin: 0,
    gapPrevSec: 0,
    gapNextMin: 0,
    gapNextSec: 0,
    history: [],
  })

  // Sync readonly with localStorage PIN cache:
  // - readonly=true + PIN cached → flip to readonly=false (auto-unlock)
  // - readonly=false + no PIN cached → flip to readonly=true (security: prevent URL bypass)
  useEffect(() => {
    if (!teamData?.pin) return
    let cached = false
    try { cached = localStorage.getItem(teamUnlockKey(teamId, teamData.pin)) === '1' } catch (_) {}
    if (readonly && cached) {
      navigate({
        to: '/team/$teamId',
        params: { teamId },
        search: { tab: 'live', readonly: false },
        replace: true,
      })
    } else if (!readonly && !cached) {
      navigate({
        to: '/team/$teamId',
        params: { teamId },
        search: { tab: 'planning', readonly: true },
        replace: true,
      })
    }
  }, [readonly, teamData?.pin, teamId])

  useEffect(() => {
    if (teamData) {
      setTeam({
        id: teamData._id,
        name: teamData.name,
        maxRunners: teamData.maxRunners,
        pin: teamData.pin,
        category: teamData.category,
        goalLaps: teamData.goalLaps,
        color: teamData.color,
        ready: teamData.ready,
        autoPaused: teamData.autoPaused,
        groupModeQueue: teamData.groupModeQueue,
        profileImage: teamData.profileImage,
        contactName: teamData.contactName,
        contactPhone: teamData.contactPhone,
      })
      if (teamData.runners && teamData.runners.length > 0) {
        const augmented = teamData.runners.map((r: any, idx: number) => ({
          id: r.id,
          name: r.name,
          kmMin: r.kmMin,
          kmSec: r.kmSec,
          energy: r.energy ?? 100,
          plannedLaps: r.plannedLaps ?? 4,
          color: r.color || RUNNER_PALETTE[idx % RUNNER_PALETTE.length],
          status: r.status || 'ready',
          liveKmMin: r.liveKmMin ?? null,
          liveKmSec: r.liveKmSec ?? null,
          gender: r.gender,
          group: r.group,
        }))
        setRunners(augmented)
        const hasPersistedOrder = Array.isArray(teamData.order) && teamData.order.length > 0
        const incomingOrder: string[] = hasPersistedOrder ? teamData.order : augmented.map((r: any) => r.id)
        setOrder(incomingOrder)
        // Persist initial order to Convex if missing (team created via admin without seed)
        if (!hasPersistedOrder && !readonly && teamData._id) {
          setTeamOrderMutation({ teamId: teamData._id, order: incomingOrder }).catch((err: any) =>
            console.error('init teamOrder:', err),
          )
        }
      }
    }
  }, [teamData])

  const setRunnersPersist: typeof setRunners = (updater) => {
    setRunners((prev: any[]) => {
      const next = typeof updater === 'function' ? (updater as any)(prev) : updater
      if (readonly) return next
      if (teamData?._id) {
        const prevIds = new Set(prev.map((r: any) => r.id))
        const nextIds = new Set(next.map((r: any) => r.id))
        for (const r of next) {
          const prevRunner = prev.find((p: any) => p.id === r.id)
          if (!prevRunner || JSON.stringify(prevRunner) !== JSON.stringify(r)) {
            upsertRunnerMutation({
              teamId: teamData._id,
              runner: {
                id: r.id,
                name: r.name,
                kmMin: r.kmMin,
                kmSec: r.kmSec,
                energy: r.energy,
                plannedLaps: r.plannedLaps,
                color: r.color,
                status: r.status,
                gender: r.gender,
                liveKmMin: r.liveKmMin ?? undefined,
                liveKmSec: r.liveKmSec ?? undefined,
              },
            }).catch((err: any) => {
              const msg = err?.data?.message || err?.message || 'Erreur enregistrement coureur'
              pushToast(msg, 'AlertTriangle')
              // Rollback optimistic UI to prev snapshot
              setRunners(prev as any)
            })
          }
        }
        for (const id of prevIds) {
          if (!nextIds.has(id)) {
            deleteRunnerMutation({ teamId: teamData._id, runnerLocalId: id as string }).catch((err: any) => {
              const msg = err?.data?.message || err?.message || 'Suppression refusée'
              pushToast(msg, 'AlertTriangle')
              // Rollback: re-insert the deleted runner
              setRunners(prev as any)
            })
          }
        }
      }
      // Auto-sync teamOrder: append newly added runner ids, drop deleted ones
      setOrderPersist((prevOrder) => {
        const nextIds = new Set(next.map((r: any) => r.id))
        const kept = prevOrder.filter((id) => nextIds.has(id))
        const newIds = next.map((r: any) => r.id).filter((id: string) => !kept.includes(id))
        if (newIds.length === 0 && kept.length === prevOrder.length) return prevOrder
        return [...kept, ...newIds]
      })
      return next
    })
  }

  const setOrderPersist: typeof setOrder = (updater) => {
    setOrder((prev) => {
      const next = typeof updater === 'function' ? (updater as any)(prev) : updater
      if (readonly) return next
      if (teamData?._id) {
        if (orderTimer.current) clearTimeout(orderTimer.current)
        orderTimer.current = setTimeout(() => {
          setTeamOrderMutation({ teamId: teamData._id, order: next }).catch((err: any) =>
            console.error('set order failed:', err),
          )
        }, 300)
      }
      return next
    })
  }

  const setTeamPersist: typeof setTeam = (updater) => {
    setTeam((prev: any) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      if (readonly) return next
      if (teamData?._id) {
        const patch: Record<string, any> = {}
        for (const k of ['profileImage', 'contactName', 'contactPhone', 'name', 'category', 'color', 'goalLaps', 'maxRunners', 'pin', 'ready']) {
          if (next[k] !== prev[k]) patch[k] = next[k]
        }
        if (Object.keys(patch).length > 0) {
          if (persistTimer.current) clearTimeout(persistTimer.current)
          persistTimer.current = setTimeout(() => {
            updateTeamMutation({ teamId: teamData._id, updates: patch }).catch((err: any) => {
              console.error('Error persisting team edit:', err)
            })
          }, 400)
        }
      }
      return next
    })
  }

  const race = {
    started: event?.status === 'running',
    startTime: event?.actualStart || null,
    laps: lapsData || [],
    currentIdx: teamData?.currentIdx || 0,
  }

  // Sanitize: clear absurd liveKm (>15:00/km) on each loaded runner — fixes bad auto-calib data
  useEffect(() => {
    if (readonly) return
    if (!teamData?._id || !teamData?.runners) return
    for (const r of teamData.runners as any[]) {
      if (r.liveKmMin == null || r.liveKmSec == null) continue
      const sec = (r.liveKmMin || 0) * 60 + (r.liveKmSec || 0)
      // Realistic human pace: 2:00/km .. 15:00/km. Anything outside = bad data → clear.
      if (sec > 15 * 60 || sec < 2 * 60) {
        upsertRunnerMutation({
          teamId: teamData._id,
          runner: {
            id: r.id,
            name: r.name,
            kmMin: r.kmMin,
            kmSec: r.kmSec,
            energy: r.energy ?? 100,
            plannedLaps: r.plannedLaps ?? 4,
            color: r.color,
            status: r.status,
            liveKmMin: undefined,
            liveKmSec: undefined,
          },
        }).catch((err: any) => console.error('clear absurd liveKm:', err))
      }
    }
  }, [teamData?._id, teamData?.runners])

  // Auto-compute goalLaps from runners + order BEFORE race start. Frozen once race started.
  useEffect(() => {
    if (readonly) return
    if (race.started) return
    if (!teamData?._id) return
    if (!runners || runners.length === 0) return
    const raceDur = event?.raceDuration || 24 * 3600 * 1000
    const estimate = estimateGoalLaps(runners as any, order, raceDur)
    if (estimate > 0 && estimate !== teamData.goalLaps) {
      updateTeamMutation({ teamId: teamData._id, updates: { goalLaps: estimate } }).catch((err: any) =>
        console.error('auto goalLaps update:', err),
      )
    }
  }, [runners, order, race.started, teamData?._id, teamData?.goalLaps, event?.raceDuration])

  const setRaceShim = async (updater: any) => {
    if (readonly) return
    const next = typeof updater === 'function' ? updater(race) : updater
    if (!teamData?._id) return
    if (next.laps.length > race.laps.length) {
      const lastNew = next.laps[next.laps.length - 1]
      const isRelay = lastNew.type === 'relay' || lastNew.type === 'relay_manual'
      try { await recordLapMutation({ teamId: teamData._id, change: isRelay }) } catch (e) { console.error(e) }
    } else if (next.laps.length < race.laps.length) {
      const removed = race.laps.find((l: any) => !next.laps.find((nl: any) => nl._id === l._id))
      if (removed?._id) {
        try { await deleteLapMutation({ lapId: removed._id }) } catch (e) { console.error(e) }
      }
    }
  }

  const schedule = {
    startISO: event?.scheduledStart ? new Date(event.scheduledStart).toISOString().slice(0, 16) : '',
    endISO: event?.scheduledEnd ? new Date(event.scheduledEnd).toISOString().slice(0, 16) : '',
  }

  return (
    <div className={`page ${readonly ? 'is-readonly' : ''}`}>
      <TestModeBadge testMode={(event as any)?.testMode} />
      <div className="grid" style={{ gap: 14, maxWidth: 1280, margin: '0 auto' }}>
        <div className="card" style={{ padding: '8px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              className="btn ghost"
              onClick={() => navigate({ to: isAdminUnlocked ? '/admin' : '/' })}
              style={{ fontSize: 13 }}
              title={isAdminUnlocked ? 'Retour admin' : 'Retour accueil'}
            >
              ← {isAdminUnlocked ? 'Admin' : 'Accueil'}
            </button>
            <span style={{ color: 'var(--muted)' }}>·</span>
            <span
              style={{
                width: 10, height: 10, borderRadius: 999,
                background: team.color || 'var(--accent)', display: 'inline-block',
              }}
            />
            <strong style={{ fontSize: 14 }}>{team.name || '(sans nom)'}</strong>
            {readonly && (
              <>
                <span
                  className="badge"
                  style={{
                    marginLeft: 8,
                    background: 'oklch(0.78 0.18 80 / 0.18)',
                    color: 'oklch(0.92 0.16 80)',
                    border: '1px solid oklch(0.78 0.18 80 / 0.5)',
                  }}
                >
                  👁️ LECTURE SEULE
                </span>
                <button
                  className="btn primary"
                  style={{ marginLeft: 'auto', fontSize: 12, padding: '6px 12px' }}
                  onClick={() => {
                    setLoginPin('')
                    setLoginError(false)
                    setLoginOpen(true)
                  }}
                  title="Entrer le PIN pour activer le mode gestionnaire"
                >
                  🔓 Login
                </button>
              </>
            )}
            {!readonly && (
              <button
                className="btn ghost"
                style={{ marginLeft: 'auto', fontSize: 12 }}
                title="Verrouiller l'équipe — le PIN sera redemandé au prochain accès"
                onClick={() => {
                  if (!window.confirm("Verrouiller l'équipe ? Le PIN sera redemandé au prochain accès.")) return
                  try {
                    const pin = (team as any).pin || teamData?.pin
                    if (pin) localStorage.removeItem(`teamlap.team.${teamId}.pin.${pin}`)
                  } catch (_) {}
                  navigate({ to: '/' })
                }}
              >
                🔒 Verrouiller
              </button>
            )}
          </div>
          <div className="tabs team-tabs" role="tablist" style={{ marginTop: 10, overflowX: 'auto', flexWrap: 'wrap' }}>
            {TABS.filter(t => !readonly || VIEWER_TABS.includes(t.id)).map(t => (
              <button
                key={t.id}
                role="tab"
                aria-selected={activeTab === t.id}
                onClick={() => setActiveTab(t.id)}
                className="tab"
              >
                <span className="team-tab-icon" aria-hidden="true">{t.icon}</span>
                <span className="team-tab-label">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'setup' && (
          <SetupScreen
            team={team}
            setTeam={setTeamPersist}
            runners={runners}
            setRunners={setRunnersPersist}
            onContinue={() => setActiveTab('planning')}
            minLapSec={(event as any)?.minLapSec ?? 165}
            maxLapSec={(event as any)?.maxLapSec ?? 480}
            maxRunnersPerTeam={(event as any)?.maxRunnersPerTeam ?? 10}
            canDeleteRunner={(event as any)?.status === 'scheduled'}
          />
        )}
        {activeTab === 'planning' && (
          <PlanningScreen
            readonly={readonly}
            runners={runners}
            setRunners={readonly ? undefined : setRunnersPersist}
            order={order}
            setOrder={setOrderPersist}
            schedule={schedule}
            onContinue={() => setActiveTab('live')}
            onBack={() => setActiveTab('setup')}
            raceStartTime={event?.actualStart || null}
            currentIdx={teamData?.currentIdx || 0}
            currentRunnerLapsDone={(() => {
              const cId = order[(teamData?.currentIdx || 0) % Math.max(1, order.length)]
              if (!cId) return 0
              const all = (lapsData || []).filter((l: any) => l.type !== 'position').slice().sort((a: any, b: any) => a.timestamp - b.timestamp)
              let count = 0
              for (let i = all.length - 1; i >= 0; i--) {
                const l = all[i]
                if (l.type === 'relay_manual' || l.type === 'relay_auto') break
                if (l.runnerId === cId) count++
              }
              return count
            })()}
            currentRunnerExpectedLapMs={(() => {
              const minLap = ((event as any)?.minLapSec ?? 165) * 1000
              const maxLap = ((event as any)?.maxLapSec ?? 480) * 1000
              const cR = (runners as any[]).find((r) => r.id === order[(teamData?.currentIdx || 0) % Math.max(1, order.length)])
              if (!cR) return 0
              if (cR.liveKmMin != null && cR.liveKmSec != null) {
                const liveMs = (cR.liveKmMin * 60 + cR.liveKmSec) * 900 // = secPerKm * 0.9 sec
                const liveLapMs = Math.round(liveMs)
                if (liveLapMs >= minLap && liveLapMs <= maxLap) return liveLapMs
              }
              return (cR.kmMin * 60 + cR.kmSec) * 900
            })()}
            currentLapStartedAt={(() => {
              if (!event?.actualStart) return null
              const all = (lapsData || []).filter((l: any) => l.type !== 'position').slice().sort((a: any, b: any) => a.timestamp - b.timestamp)
              return all.length ? all[all.length - 1].timestamp : event.actualStart
            })()}
            weatherForecast={weather?.data || null}
            weatherUnavailable={null}
            weatherProviderLabel={weatherProviderLabel}
            weatherCityName={(event as any)?.cityName ?? null}
            theoreticalCycleMs={(teamData as any)?.theoreticalCycleMs ?? null}
            onOpenWeatherDialog={
              event?._id && (event as any)?.latitude != null && (event as any)?.longitude != null
                ? () => setWeatherDialogOpen(true)
                : undefined
            }
            groupModeQueue={(team as any).groupModeQueue}
            onSetRunnerGroup={readonly ? undefined : (rid, group) => {
              if (!teamData?._id) return
              setRunnerGroupMutation({ teamId: teamData._id, runnerLocalId: rid, group }).catch((err: any) =>
                console.error('setRunnerGroup:', err),
              )
            }}
            onEnqueueGroupMode={readonly ? undefined : (groupName, remainingRelays) => {
              if (!teamData?._id) return
              enqueueGroupModeMutation({ teamId: teamData._id, groupName, remainingRelays }).catch((err: any) =>
                console.error('enqueueGroupMode:', err),
              )
            }}
            onCancelGroupModeEntry={readonly ? undefined : (index) => {
              if (!teamData?._id) return
              cancelGroupModeEntryMutation({ teamId: teamData._id, index }).catch((err: any) =>
                console.error('cancelGroupModeEntry:', err),
              )
            }}
            onStopActiveGroupMode={readonly ? undefined : () => {
              if (!teamData?._id) return
              stopActiveGroupModeMutation({ teamId: teamData._id }).catch((err: any) =>
                console.error('stopActiveGroupMode:', err),
              )
            }}
          />
        )}
        {activeTab === 'live' && (
          <LiveScreen
            runners={runners}
            setRunners={setRunnersPersist}
            order={order}
            setOrder={setOrderPersist}
            race={race}
            setRace={setRaceShim as any}
            onBack={() => setActiveTab('planning')}
            team={team}
            setTeamReady={(ready) => setTeamPersist((t: any) => ({ ...t, ready }))}
            onRecordLap={async (change, runnerId) => {
              if (readonly || !teamData?._id) return undefined
              try {
                return await recordLapMutation({ teamId: teamData._id, change, runnerId })
              } catch (err: any) {
                console.error('recordLap:', err)
                return undefined
              }
            }}
            onUndoLap={(docId) => {
              if (readonly) return
              deleteLapMutation({ lapId: docId as any }).catch((err: any) => console.error('undo lap:', err))
            }}
            onUndoLastLap={() => {
              if (readonly) return
              const arr = (lapsData || []).filter((l: any) => l.type !== 'position').slice().sort((a: any, b: any) => a.timestamp - b.timestamp)
              const last = arr[arr.length - 1]
              if (!last?._id) return
              deleteLapMutation({ lapId: last._id as any }).catch((err: any) => console.error('undo last lap:', err))
            }}
            onUpdateLapTime={(lapId, lapTimeMs) => {
              if (readonly) return
              updateLapMutation({ lapId: lapId as any, lapTime: lapTimeMs }).catch((err: any) =>
                console.error('updateLap:', err),
              )
            }}
            onSetCurrentIdx={(idx) => {
              if (readonly || !teamData?._id) return
              updateTeamMutation({ teamId: teamData._id, updates: { currentIdx: idx } }).catch((err: any) =>
                console.error('set currentIdx:', err),
              )
            }}
            replaceAutoWindowSec={(event as any)?.replaceAutoWindowSec ?? 180}
            minLapSec={(event as any)?.minLapSec ?? 165}
            relayTransitionSec={(event as any)?.relayTransitionSec ?? 5}
            scheduledEnd={(event as any)?.scheduledEnd ?? null}
            teamFinishedAt={(teamData as any)?.finishedAt ?? null}
            onRecordTeamFinish={async () => {
              if (readonly || !teamData?._id) return
              await recordFinishMutation({ teamId: teamData._id })
            }}
            pushToast={pushToast}
            onSetAutoPaused={(paused) => {
              if (readonly || !teamData?._id) return
              setAutoPausedMutation({ teamId: teamData._id, paused }).catch((err: any) =>
                console.error('setAutoPaused:', err),
              )
            }}
          />
        )}
        {activeTab === 'history' && (
          <HistoryScreen
            runners={runners}
            runnersFull={runners}
            laps={lapsData || []}
            raceStartTime={event?.actualStart || null}
            raceStarted={race.started}
            minLapSec={(event as any)?.minLapSec ?? 165}
            maxLapSec={(event as any)?.maxLapSec ?? 480}
            relayTransitionSec={(event as any)?.relayTransitionSec ?? 5}
            ranking={readonly ? undefined : ranking}
            setRanking={readonly ? undefined : setRanking}
            onAddPosition={readonly ? undefined : () => {}}
            onDeleteLap={readonly ? undefined : (lapId) => {
              if (!window.confirm('Supprimer ce tour ?')) return
              deleteLapMutation({ lapId: lapId as any }).catch((err: any) => console.error('delete lap:', err))
            }}
            onUpdateLap={readonly ? undefined : (lapId, payload) => {
              updateLapMutation({
                lapId: lapId as any,
                runnerId: payload.runnerId,
                timestamp: payload.timestamp,
                forcedExtra: payload.forcedExtra,
                type: payload.type,
              }).catch((err: any) => console.error('updateLap:', err))
              if (payload.energy != null && teamData?._id) {
                const r = (runners as any[]).find((x) => x.id === payload.runnerId)
                if (r) {
                  upsertRunnerMutation({
                    teamId: teamData._id,
                    runner: { ...r, energy: payload.energy },
                  }).catch((err: any) => console.error('upsertRunner energy:', err))
                }
              }
            }}
            onAddBulkRelay={readonly ? undefined : (p) => {
              if (!teamData?._id) return
              addBulkRelayMutation({
                teamId: teamData._id,
                runnerId: p.runnerId,
                lapTimeMs: p.lapTimeMs,
                anchorMs: p.anchorMs,
                anchorKind: p.anchorKind,
                nbLaps: p.nbLaps,
                approximate: p.approximate,
              }).catch((err: any) => console.error('addBulkRelay:', err))
            }}
            onInsertLap={readonly ? undefined : (payload) => {
              if (!teamData?._id) return
              insertLapAtMutation({
                teamId: teamData._id,
                runnerId: payload.runnerId,
                timestamp: payload.timestamp,
                type: payload.type,
                forcedExtra: payload.forcedExtra,
              }).catch((err: any) => console.error('insertLapAt:', err))
              if (payload.energy != null) {
                const r = (runners as any[]).find((x) => x.id === payload.runnerId)
                if (r) {
                  upsertRunnerMutation({
                    teamId: teamData._id,
                    runner: { ...r, energy: payload.energy },
                  }).catch((err: any) => console.error('upsertRunner energy:', err))
                }
              }
            }}
          />
        )}
        {activeTab === 'contact' && (
          <ContactScreen
            team={team}
            event={event}
          />
        )}
      </div>

      {/* Bottom snackbar — team ready toggle, shown before race start on every tab */}
      {!race.started && teamData?._id && !readonly && (
        <div className={`ready-snackbar ${team.ready ? 'is-ready' : ''}`}>
          <span className="ready-msg">
            {team.ready
              ? '✓ Équipe prête au départ'
              : 'En attente du top départ. Marquer l\'équipe prête ?'}
          </span>
          <button
            className="ready-btn"
            onClick={() => setTeamPersist((t: any) => ({ ...t, ready: !t.ready }))}
          >
            {team.ready ? 'Annuler prêt' : 'Prêt'}
          </button>
        </div>
      )}

      {/* Weather source picker dialog */}
      <WeatherSourceDialog
        open={weatherDialogOpen}
        onClose={() => setWeatherDialogOpen(false)}
        eventId={event?._id ?? null}
        currentProvider={weatherProvider}
        onSelect={(id) => {
          setWeatherProvider(id)
          const r = writePreferredProvider(id)
          if (!r.persisted) {
            pushToast('Préférence non persistée sur ce navigateur', 'AlertTriangle')
          } else {
            pushToast(`Source météo : ${WEATHER_PROVIDERS.find((p) => p.id === id)?.label ?? id}`, 'Check')
          }
        }}
      />

      {/* Login dialog — viewer → manager mode */}
      {loginOpen && (
        <Modal
          title={`Accès gestionnaire : ${team.name || ''}`}
          icon="🔒"
          onClose={() => setLoginOpen(false)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setLoginOpen(false)}>
                Annuler
              </button>
              <button
                className="btn primary"
                disabled={loginPin.length < 4}
                onClick={() => {
                  const expected = teamData?.pin
                  if (!expected) return
                  if (loginPin === expected) {
                    try { localStorage.setItem(teamUnlockKey(teamId, expected), '1') } catch (_) {}
                    setLoginOpen(false)
                    setLoginPin('')
                    setLoginError(false)
                    navigate({
                      to: '/team/$teamId',
                      params: { teamId },
                      search: { tab: 'live', readonly: false },
                      replace: true,
                    })
                  } else {
                    setLoginError(true)
                    setTimeout(() => setLoginError(false), 800)
                  }
                }}
              >
                ✓ Valider
              </button>
            </>
          }
        >
          <div className="grid" style={{ gap: 12 }}>
            <div className="hint">Entrez le code PIN de l'équipe pour activer le mode gestionnaire.</div>
            <div className="field">
              <span className="field-label">Code PIN</span>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                value={loginPin}
                onChange={(e) => setLoginPin(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && loginPin.length >= 4) {
                    const expected = teamData?.pin
                    if (!expected) return
                    if (loginPin === expected) {
                      try { localStorage.setItem(teamUnlockKey(teamId, expected), '1') } catch (_) {}
                      setLoginOpen(false)
                      setLoginPin('')
                      setLoginError(false)
                      navigate({
                        to: '/team/$teamId',
                        params: { teamId },
                        search: { tab: 'live', readonly: false },
                        replace: true,
                      })
                    } else {
                      setLoginError(true)
                      setTimeout(() => setLoginError(false), 800)
                    }
                  }
                }}
                autoFocus
                className="mono"
                style={{
                  fontSize: 22,
                  letterSpacing: '0.4em',
                  textAlign: 'center',
                  borderColor: loginError ? 'var(--danger)' : undefined,
                }}
                placeholder="••••"
                autoComplete="off"
              />
              {loginError && (
                <span className="hint" style={{ color: 'var(--danger)' }}>Code incorrect</span>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Toast notifications */}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <span className="toast-icon">{t.icon === 'Repeat' ? '🔁' : t.icon === 'Flag' ? '🏁' : '✓'}</span>
            <span style={{ flex: 1 }}>{t.text}</span>
            {t.action && (
              <button
                className="btn ghost"
                style={{ padding: '4px 10px', fontSize: 12 }}
                onClick={() => {
                  t.action?.fn()
                  setToasts((s) => s.filter((x) => x.id !== t.id))
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
