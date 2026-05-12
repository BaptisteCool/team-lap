import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { ContactScreen } from '../components/ContactScreen'
import { HistoryScreen } from '../components/HistoryScreen'
import { LiveScreen } from '../components/LiveScreen'
import { PlanningScreen } from '../components/PlanningScreen'
import { SetupScreen } from '../components/SetupScreen'
import { useMutation, useQuery } from '../convex/hooks'
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

const TAB_IDS = TABS.map((t) => t.id) as Tab[]

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
  const { tab: activeTab, readonly } = Route.useSearch()
  const navigate = useNavigate()
  const setActiveTab = (next: Tab) =>
    navigate({ to: '/team/$teamId', params: { teamId }, search: { tab: next, readonly } })

  const event = useQuery('events:getBySlug' as any, { slug: EVENT_SLUG })
  const teamData = useQuery('teams:getTeam' as any, { teamId: teamId as any })
  const lapsData = useQuery('laps:getLaps' as any, { teamId: teamId as any }) as any[] | null | undefined

  const updateTeamMutation = useMutation('teams:updateTeam' as any)
  const recordLapMutation = useMutation('laps:recordLap' as any)
  const deleteLapMutation = useMutation('laps:deleteLap' as any)
  const setTeamOrderMutation = useMutation('teams:setTeamOrder' as any)
  const upsertRunnerMutation = useMutation('teams:upsertRunner' as any)
  const deleteRunnerMutation = useMutation('teams:deleteRunner' as any)
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
                liveKmMin: r.liveKmMin ?? undefined,
                liveKmSec: r.liveKmSec ?? undefined,
              },
            }).catch((err: any) => console.error('upsert runner failed:', err))
          }
        }
        for (const id of prevIds) {
          if (!nextIds.has(id)) {
            deleteRunnerMutation({ teamId: teamData._id, runnerLocalId: id as string }).catch((err: any) =>
              console.error('delete runner failed:', err),
            )
          }
        }
      }
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
      if (sec > 15 * 60 || sec < 0) {
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
      <div className="grid" style={{ gap: 14, maxWidth: 1280, margin: '0 auto' }}>
        <div className="card" style={{ padding: '8px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              className="btn ghost"
              onClick={() => navigate({ to: readonly ? '/admin' : '/' })}
              style={{ fontSize: 13 }}
              title={readonly ? 'Retour admin' : 'Retour accueil'}
            >
              ← {readonly ? 'Admin' : 'Accueil'}
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
            )}
          </div>
          <div className="tabs team-tabs" role="tablist" style={{ marginTop: 10, overflowX: 'auto', flexWrap: 'wrap' }}>
            {TABS.map(t => (
              <button
                key={t.id}
                role="tab"
                aria-selected={activeTab === t.id}
                onClick={() => setActiveTab(t.id)}
                className="tab"
              >
                <span>{t.icon}</span>
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
          />
        )}
        {activeTab === 'planning' && (
          <PlanningScreen
            runners={runners}
            order={order}
            setOrder={setOrderPersist}
            schedule={schedule}
            onContinue={() => setActiveTab('live')}
            onBack={() => setActiveTab('setup')}
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
          />
        )}
        {activeTab === 'history' && (
          <HistoryScreen
            runners={runners}
            laps={lapsData || []}
            raceStartTime={event?.actualStart || null}
            raceStarted={race.started}
            ranking={ranking}
            setRanking={setRanking}
            onAddPosition={() => {}}
            onDeleteLap={(lapId) => {
              deleteLapMutation({ lapId: lapId as any }).catch((err: any) => console.error('delete lap:', err))
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
      {!race.started && teamData?._id && (
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
    </div>
  )
}
