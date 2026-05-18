import { v } from 'convex/values'
import { action, internalAction, internalMutation, internalQuery } from './_generated/server'
import { internal } from './_generated/api'
import {
  buildChronoplaceUrl,
  isChronoplaceLapShape,
  parseChronoplaceTime,
} from './lib/chronoplace'
import { computeNextRunnerIdx, consumeQueueOnRelay, type GroupModeEntry } from './lib/nextRunner'
import { getEffectiveTimings } from './lib/timings'
import { buildMockChronoplaceResponse, getMockLapMeta, getMockNextLapTimeMs, shouldUseMockChronoplace } from './lib/mockChronoplace'
import { getMockRunnerForLap, getMockStintLengthForLap, isMockRelayLap } from './lib/mockChronoplaceSchedule'

// Min lap gap floor — also used to guard pace calibration against double-tap garbage.
const MIN_LAP_GAP_MS = 5000
// Lap loop length in meters (matches client + laps.ts).
const LAP_DISTANCE_M = 900

// Burst polling tuning. The auto chain is started at the theoretical next-lap time;
// the manual chain is started immediately on user click. In test mode, `maxAttempts`
// is divided by `testModeDivider` so the polling window shrinks proportionally to the
// compressed lap durations.
const POLL_INTERVAL_MS = 1000
const MAX_AUTO_ATTEMPTS_BASE = 36
const MAX_MANUAL_ATTEMPTS_BASE = 30
// Stuck-team retry: after the burst window expires without finding a lap, the runner is
// presumed stopped or has lost their Chronoplace chip. We pause the team and retry once
// every 60s until a new lap is published; on success the chain returns to normal cadence.
const STUCK_RETRY_INTERVAL_MS = 60000

function maxAttemptsForBurst(type: 'manual' | 'auto', divider: number): number {
  // Manual click polling: 30 attempts × 1s = 30s window REGARDLESS of testModeDivider
  // (user-driven, doit pouvoir attendre la vraie valeur même en mode compressé).
  // Auto chain: scale par divider (cadence compressée en test).
  if (type === 'manual') return MAX_MANUAL_ATTEMPTS_BASE
  return Math.max(1, Math.round(MAX_AUTO_ATTEMPTS_BASE / Math.max(1, divider)))
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function kmPaceFromLapMs(lapMs: number, distanceM: number = LAP_DISTANCE_M): { min: number; sec: number } {
  const secPerKm = (lapMs / 1000) * (1000 / distanceM)
  const min = Math.floor(secPerKm / 60)
  const sec = Math.round(secPerKm - min * 60)
  return { min, sec }
}

function kmPaceToLapMs(min: number, sec: number, distanceM: number = LAP_DISTANCE_M): number {
  const paceSec = min * 60 + sec
  return Math.round((paceSec * distanceM) / 1000) * 1000
}

// Fetch the Chronoplace lap list — branches to the mock when the event is in test mode
// and the team slug matches the recorded HEROES ACADEMY dataset.
async function fetchChronoplaceLaps(sctx: {
  chronoplaceEventId?: number
  chronoplaceSlug?: string
  testMode?: boolean
  actualStart?: number
  testModeDivider?: number
}): Promise<{ ok: true; body: unknown[] } | { ok: false; error: string }> {
  if (shouldUseMockChronoplace(sctx.chronoplaceSlug, sctx.testMode)) {
    const divider = sctx.testModeDivider && sctx.testModeDivider > 0 ? sctx.testModeDivider : 3
    const body = buildMockChronoplaceResponse(sctx.chronoplaceSlug || '', sctx.actualStart || 0, Date.now(), divider)
    return { ok: true, body }
  }
  if (!sctx.chronoplaceEventId || !sctx.chronoplaceSlug) {
    return { ok: false, error: 'no_config' }
  }
  const url = buildChronoplaceUrl(sctx.chronoplaceEventId, sctx.chronoplaceSlug)
  let res: Response
  try {
    res = await fetch(url, { headers: { 'User-Agent': 'TeamLap/1.0' } })
  } catch (_e) {
    return { ok: false, error: 'unreachable' }
  }
  if (res.status === 404) return { ok: false, error: 'not_found' }
  if (!res.ok) return { ok: false, error: 'http_' + res.status }
  let body: unknown
  try {
    body = await res.json()
  } catch (_e) {
    return { ok: false, error: 'invalid_json' }
  }
  if (!Array.isArray(body)) return { ok: false, error: 'invalid_shape' }
  return { ok: true, body }
}

// ─── Internal queries ──────────────────────────────────────────────────────

export const getTeamSyncContext = internalQuery({
  args: { teamId: v.id('teams') },
  handler: async (ctx, { teamId }) => {
    const team = await ctx.db.get(teamId)
    if (!team) return null
    const event = await ctx.db.get(team.eventId)
    return {
      teamId,
      eventId: team.eventId,
      chronoplaceSlug: (team as any).chronoplaceSlug as string | undefined,
      chronoplaceEventId: (event as any)?.chronoplaceEventId as number | undefined,
      eventStatus: event?.status as string | undefined,
      actualEnd: (event as any)?.actualEnd as number | undefined,
      actualStart: (event as any)?.actualStart as number | undefined,
      testMode: (event as any)?.testMode as boolean | undefined,
      testModeDivider: (event as any)?.testModeDivider as number | undefined,
      pendingPollBurst: (team as any).pendingPollBurst as any,
    }
  },
})

// Teams eligible for safety-net polling (client-driven dispatchSync):
// chronoSyncEnabled === true AND event.status === 'running' AND no actualEnd.
export const listEligibleTeams = internalQuery({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db
      .query('events')
      .withIndex('by_status', (q) => q.eq('status', 'running'))
      .collect()
    const out: Array<{ teamId: any; eventId: any }> = []
    for (const ev of events) {
      if ((ev as any).actualEnd) continue
      if (!(ev as any).chronoplaceEventId) continue
      const teams = await ctx.db
        .query('teams')
        .withIndex('by_event', (q) => q.eq('eventId', ev._id))
        .collect()
      for (const t of teams) {
        if (!(t as any).chronoSyncEnabled) continue
        if (!(t as any).chronoplaceSlug) continue
        if ((t as any).finishedAt) continue
        out.push({ teamId: t._id, eventId: ev._id })
      }
    }
    return out
  },
})

// ─── Internal mutations ────────────────────────────────────────────────────

export const markSyncResult = internalMutation({
  args: {
    teamId: v.id('teams'),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { teamId, error }) => {
    const team = await ctx.db.get(teamId)
    if (!team) return
    const now = Date.now()
    const patch: Record<string, any> = {
      lastChronoSyncAt: now,
      chronoSyncError: error,
      updatedAt: now,
    }
    await ctx.db.patch(teamId, patch as any)
  },
})

// Insert or overwrite one Chronoplace lap (idempotent on chronoplaceId).
// `manualTag` (when set) forces lap type to checkpoint_manual / relay_manual and may
// override runnerId — used when a manual burst discovers the new lap.
export const applyChronoplaceLap = internalMutation({
  args: {
    teamId: v.id('teams'),
    chronoplaceId: v.number(),
    lapNumber: v.number(),
    lapTimeMs: v.number(),
    createdAtMs: v.number(),
    rang: v.optional(v.number()),
    manualTag: v.optional(v.object({
      kind: v.union(v.literal('pass'), v.literal('relay')),
      runnerId: v.optional(v.string()),
    })),
  },
  handler: async (ctx, { teamId, chronoplaceId, lapNumber, lapTimeMs, createdAtMs, rang, manualTag }) => {
    // 1) Idempotence: skip if we already have a lap with this Chronoplace id.
    const existingByChrono = await ctx.db
      .query('laps')
      .withIndex('by_chronoplace_id', (q) => q.eq('chronoplaceId', chronoplaceId))
      .first()
    if (existingByChrono) return { kind: 'skip', reason: 'duplicate' as const }

    const team = await ctx.db.get(teamId)
    if (!team) return { kind: 'skip', reason: 'no_team' as const }

    const runners = await ctx.db
      .query('runners')
      .withIndex('by_team', (q) => q.eq('teamId', teamId))
      .collect()
    // Équipe sans runner configuré (ex: équipes mock autres que Heroes) → on insère
    // quand même le lap avec runnerId vide pour conserver le timing + progress map,
    // mais sans calibration pace ni avance currentIdx.
    const noRunners = runners.length === 0

    const orderDoc = await ctx.db
      .query('teamOrder')
      .withIndex('by_team', (q) => q.eq('teamId', teamId))
      .first()
    const orderArr: string[] = noRunners
      ? []
      : (orderDoc && orderDoc.order && orderDoc.order.length > 0
          ? orderDoc.order
          : runners.map((r: any) => r.id))

    // Pas de wrap: si currentIdx >= order.length, on a consommé tous les coureurs prévus
    // et les laps suivants restent non-attribués (continue sur la carte sans coureur connu).
    const currentIdxRaw = team.currentIdx || 0
    const currentRunnerLocalId = orderArr.length > 0 && currentIdxRaw < orderArr.length
      ? orderArr[currentIdxRaw]
      : ''

    // Mock mode (Heroes Academy testMode): runner attribution + relay detection
    // use a pre-baked schedule that mirrors the real race plan (night group split,
    // Pascal absentee coverage, variable Simon stint lengths). See mockChronoplaceSchedule.ts.
    const eventForMock = await ctx.db.get(team.eventId)
    const isMock = shouldUseMockChronoplace(
      (team as any).chronoplaceSlug,
      (eventForMock as any)?.testMode,
    )
    const mockRunnerName = isMock && !noRunners ? getMockRunnerForLap(lapNumber) : null
    const mockTargetLocalId = (() => {
      if (!mockRunnerName) return null
      const found = runners.find((r: any) => r.name === mockRunnerName)
      return found ? found.id : null
    })()

    const targetRunnerLocalId = noRunners
      ? ''
      : (manualTag?.runnerId && runners.some((r: any) => r.id === manualTag.runnerId)
          ? manualTag.runnerId
          : (mockTargetLocalId || currentRunnerLocalId))
    const runnerForLap = noRunners ? null : runners.find((r: any) => r.id === targetRunnerLocalId)
    if (!noRunners && !runnerForLap) return { kind: 'skip', reason: 'no_runner' as const }

    // Decide isRelay. Manual tag forces the decision; mock uses schedule; else derive from stint progress.
    // Pour équipe sans runner, pas de relai computable.
    let isRelay: boolean
    if (noRunners) {
      isRelay = false
    } else if (manualTag) {
      isRelay = manualTag.kind === 'relay'
    } else if (isMock && mockRunnerName) {
      isRelay = isMockRelayLap(lapNumber)
    } else {
      const allTeamLaps = await ctx.db
        .query('laps')
        .withIndex('by_team', (q) => q.eq('teamId', teamId))
        .collect()
      const sortedDesc = [...allTeamLaps].sort((a: any, b: any) => b.timestamp - a.timestamp)
      let lapsThisStint = 0
      for (const l of sortedDesc) {
        if (l.type === 'relay_manual' || l.type === 'relay_auto') break
        if (l.runnerId === currentRunnerLocalId) lapsThisStint++
      }
      const planned = (runnerForLap as any)?.plannedLaps ?? 4
      isRelay = lapsThisStint + 1 >= planned
    }
    const lapType: 'checkpoint_manual' | 'relay_manual' | 'checkpoint_auto' | 'relay_auto' = manualTag
      ? (isRelay ? 'relay_manual' : 'checkpoint_manual')
      : (isRelay ? 'relay_auto' : 'checkpoint_auto')

    // 2) If a team-lap already exists for this lapNumber → overwrite (Chronoplace prime).
    const existingByLapNumber = await ctx.db
      .query('laps')
      .withIndex('by_team_lapNumber', (q) => q.eq('teamId', teamId).eq('lapNumber', lapNumber))
      .first()

    let lapId: any
    if (existingByLapNumber) {
      const wasManual =
        existingByLapNumber.type === 'checkpoint_manual' || existingByLapNumber.type === 'relay_manual'
      const patch: Record<string, any> = {
        chronoplaceId,
        source: 'chronoplace',
        correctedByChronoplace: wasManual ? true : (existingByLapNumber as any).correctedByChronoplace,
        lapTime: lapTimeMs,
        timestamp: createdAtMs,
        rang,
      }
      // Manual tag should also update lap type + runnerId on the existing lap (the user just
      // expressed intent post-hoc) — but only for tag-driven calls (auto chain preserves).
      if (manualTag) {
        patch.type = lapType
        patch.runnerId = targetRunnerLocalId
      }
      await ctx.db.patch(existingByLapNumber._id, patch as any)
      lapId = existingByLapNumber._id
    } else {
      // 3) Insert fresh.
      const newLapId = 'lap_chrono_' + chronoplaceId + '_' + teamId
      const prevCurrentIdx = team.currentIdx ?? 0
      const prevGroupModeQueue = ((team as any).groupModeQueue || undefined) as GroupModeEntry[] | undefined
      const event = await ctx.db.get(team.eventId)
      const tApply = getEffectiveTimings(event)
      // Mock: snapshot plannedAtStart from schedule stint length (varies per relais),
      // else use runner static plannedLaps. Si pas de runnerForLap → undefined.
      const plannedAtStartForLap = isMock
        ? (getMockStintLengthForLap(lapNumber) ?? (runnerForLap as any)?.plannedLaps)
        : (runnerForLap as any)?.plannedLaps
      const docId = await ctx.db.insert('laps', {
        teamId,
        runnerId: targetRunnerLocalId,
        id: newLapId,
        lapNumber,
        timestamp: createdAtMs,
        lapTime: lapTimeMs,
        type: lapType,
        autoRelay: isRelay && !manualTag ? true : undefined,
        prevCurrentIdx,
        plannedAtStart: plannedAtStartForLap,
        prevGroupModeQueue,
        source: 'chronoplace',
        chronoplaceId,
        rang,
        relayTransitionMsApplied: isRelay ? tApply.relayTransitionSec * 1000 : undefined,
      } as any)
      lapId = docId
    }

    // Calibrate the OUTGOING runner's pace from this Chronoplace lap (authoritative timing).
    // - Regular lap: liveKm tracks the running pace directly from lapTime.
    // - Relay lap: lapTime includes the 5s handover → strip it for liveKm (pure run pace)
    //   and store the full lapTime separately as theoreticalRelayPace.
    // En test mode, lapTimeMs est compressé par testModeDivider → on multiplie pour
    // que la pace stockée reflète l'allure réelle (pas la version accélérée).
    if (lapTimeMs >= MIN_LAP_GAP_MS && runnerForLap) {
      const event = await ctx.db.get(team.eventId)
      const tApply = getEffectiveTimings(event)
      const realLapMs = tApply.testMode ? lapTimeMs * tApply.testModeDivider : lapTimeMs
      if (isRelay) {
        const relayPace = kmPaceFromLapMs(realLapMs)
        const stripped = Math.max(MIN_LAP_GAP_MS, realLapMs - tApply.relayTransitionSec * 1000)
        const livePace = kmPaceFromLapMs(stripped)
        await ctx.db.patch(runnerForLap._id, {
          theoreticalRelayPaceMin: relayPace.min,
          theoreticalRelayPaceSec: relayPace.sec,
          liveKmMin: livePace.min,
          liveKmSec: livePace.sec,
        } as any)
      } else {
        const livePace = kmPaceFromLapMs(realLapMs)
        await ctx.db.patch(runnerForLap._id, {
          liveKmMin: livePace.min,
          liveKmSec: livePace.sec,
        } as any)
      }
    }

    // 4) On relay: advance currentIdx, reset incoming runner pace.
    if (isRelay) {
      // Skip advance if we're overwriting an existing lap that was already a relay (already advanced).
      const skipAdvance =
        existingByLapNumber &&
        (existingByLapNumber.type === 'relay_manual' || existingByLapNumber.type === 'relay_auto')
      if (!skipAdvance) {
        const prevCurrentIdx = team.currentIdx ?? 0
        const prevGroupModeQueue = ((team as any).groupModeQueue || undefined) as GroupModeEntry[] | undefined
        // Mock: next runner comes from schedule (handles night group A→B handoff which
        // doesn't follow normal order rotation). Fallback to standard nextActiveIdx logic.
        let nextIdx: number
        if (isMock && mockRunnerName) {
          // Heroes Academy schedule: lookup next runner by name (handles night group A→B).
          const nextRunnerName = getMockRunnerForLap(lapNumber + 1)
          const mockNextOrderIdx = nextRunnerName
            ? orderArr.findIndex((rid) => {
                const r = runners.find((rr: any) => rr.id === rid)
                return r && r.name === nextRunnerName
              })
            : -1
          nextIdx = mockNextOrderIdx >= 0 ? mockNextOrderIdx : orderArr.length
        } else if (orderArr.length === 0) {
          // Pas de coureurs → sentinel (laps suivants restent non-attribués).
          nextIdx = 0
        } else {
          // Linear advance NO wrap: after last runner stint → currentIdx = orderArr.length
          // (sentinel out-of-bounds) → laps suivants insérés sans runnerId. Si group mode
          // actif, on respecte la queue (computeNextRunnerIdx peut wrap pour groupes).
          if (prevGroupModeQueue && prevGroupModeQueue.length > 0) {
            nextIdx = computeNextRunnerIdx({
              order: orderArr,
              runners: runners as any,
              currentIdx: prevCurrentIdx,
              groupModeQueue: prevGroupModeQueue || null,
            })
          } else {
            nextIdx = Math.min(prevCurrentIdx + 1, orderArr.length)
          }
        }
        const nextRunnerLocalId = nextIdx < orderArr.length ? orderArr[nextIdx] : ''
        const nextRunnerDoc = nextRunnerLocalId ? runners.find((r: any) => r.id === nextRunnerLocalId) : undefined
        const newQueue = consumeQueueOnRelay(prevGroupModeQueue, nextRunnerDoc as any)
        await ctx.db.patch(teamId, {
          currentIdx: nextIdx,
          updatedAt: createdAtMs,
          groupModeQueue: newQueue,
        } as any)
        if (nextRunnerDoc) {
          await ctx.db.patch(nextRunnerDoc._id, { liveKmMin: undefined, liveKmSec: undefined } as any)
        }
      } else {
        await ctx.db.patch(teamId, { updatedAt: createdAtMs } as any)
      }
    } else {
      await ctx.db.patch(teamId, { updatedAt: createdAtMs } as any)
    }

    // Mock testMode: pré-calcul (lapTime + chronoplaceId) du tour suivant
    // → marker frontend anime à la cadence EXACTE et affiche l'id du tour en cours.
    if (isMock) {
      const eventNow = await ctx.db.get(team.eventId)
      const tNow = getEffectiveTimings(eventNow)
      const peekMeta = getMockLapMeta(
        (team as any).chronoplaceSlug,
        lapNumber + 1,
        (eventNow as any)?.actualStart || 0,
        tNow.testModeDivider,
      )
      await ctx.db.patch(teamId, {
        nextExpectedLapMs: peekMeta?.lapTimeMs ?? undefined,
        nextExpectedChronoplaceId: peekMeta?.chronoplaceId ?? undefined,
      } as any)
    }

    return {
      kind: existingByLapNumber ? ('overwrite' as const) : ('insert' as const),
      lapId,
      isRelay,
      lapNumber,
    }
  },
})

// ─── Burst lifecycle mutations ─────────────────────────────────────────────

// Arm a burst on a team. Cancels any previous burst by overwriting startedAt (stale
// scheduled steps will detect mismatch and exit). Schedules the first poll step.
export const armBurst = internalMutation({
  args: {
    teamId: v.id('teams'),
    type: v.union(v.literal('manual'), v.literal('auto')),
    kind: v.union(v.literal('pass'), v.literal('relay')),
    runnerId: v.optional(v.string()),
    fireAt: v.optional(v.number()), // absolute timestamp; default = now
  },
  handler: async (ctx, { teamId, type, kind, runnerId, fireAt }) => {
    const team = await ctx.db.get(teamId)
    if (!team) return null
    const startedAt = fireAt ?? Date.now()
    // Snapshot highest Chronoplace lap number known so far — burst will discover anything beyond.
    const laps = await ctx.db
      .query('laps')
      .withIndex('by_team', (q) => q.eq('teamId', teamId))
      .collect()
    const lastSeenChronoLapNumber = laps.reduce(
      (max: number, l: any) => (l.chronoplaceId ? Math.max(max, l.lapNumber || 0) : max),
      0,
    )
    const event = await ctx.db.get(team.eventId)
    const tArm = getEffectiveTimings(event)
    await ctx.db.patch(teamId, {
      pendingPollBurst: {
        type,
        kind,
        runnerId,
        startedAt,
        attempt: 0,
        maxAttempts: maxAttemptsForBurst(type, tArm.testModeDivider),
        lastSeenChronoLapNumber,
      },
      updatedAt: Date.now(),
    } as any)
    const delay = Math.max(0, startedAt - Date.now())
    await ctx.scheduler.runAfter(delay, internal.chronoplace.pollBurstStep, {
      teamId,
      burstStartedAt: startedAt,
    })
    return { startedAt }
  },
})

export const bumpBurstAttempt = internalMutation({
  args: { teamId: v.id('teams'), burstStartedAt: v.number(), attempt: v.number() },
  handler: async (ctx, { teamId, burstStartedAt, attempt }) => {
    const team = await ctx.db.get(teamId)
    if (!team) return
    const b = (team as any).pendingPollBurst
    if (!b || b.startedAt !== burstStartedAt) return
    await ctx.db.patch(teamId, {
      pendingPollBurst: { ...b, attempt },
      updatedAt: Date.now(),
    } as any)
  },
})

export const clearBurst = internalMutation({
  args: { teamId: v.id('teams'), burstStartedAt: v.optional(v.number()) },
  handler: async (ctx, { teamId, burstStartedAt }) => {
    const team = await ctx.db.get(teamId)
    if (!team) return
    const b = (team as any).pendingPollBurst
    if (burstStartedAt != null && b && b.startedAt !== burstStartedAt) return
    await ctx.db.patch(teamId, {
      pendingPollBurst: undefined,
      updatedAt: Date.now(),
    } as any)
  },
})

// Stuck-team retry: pause the team and arm a single-attempt burst 60s later. Keeps
// looping until a new lap appears in Chronoplace, then `pollBurstStep` clears autoPaused
// and returns to the normal chain. Skips scheduling when no viewer is present — the
// chain resumes via `presence.beat()` → `wakeChains` once someone opens the app.
export const armStuckRetry = internalMutation({
  args: { teamId: v.id('teams') },
  handler: async (ctx, { teamId }) => {
    const team = await ctx.db.get(teamId)
    if (!team) return null
    if (!(team as any).chronoSyncEnabled) return null
    const laps = await ctx.db
      .query('laps')
      .withIndex('by_team', (q) => q.eq('teamId', teamId))
      .collect()
    const lastSeenChronoLapNumber = laps.reduce(
      (max: number, l: any) => (l.chronoplaceId ? Math.max(max, l.lapNumber || 0) : max),
      0,
    )
    const hasViewers = await ctx.runQuery(internal.presence.hasViewers, {
      eventId: team.eventId,
    })
    // No viewers: mark team as paused (autoPaused) but don't schedule. When a viewer
    // arrives, wakeChains will call scheduleNextAutoBurst which detects the stuck team
    // via autoPaused and re-arms a fresh retry from there.
    if (!hasViewers) {
      await ctx.db.patch(teamId, {
        autoPaused: true,
        pendingPollBurst: undefined,
        updatedAt: Date.now(),
      } as any)
      return { skipped: 'no_viewers' as const }
    }
    const startedAt = Date.now() + STUCK_RETRY_INTERVAL_MS
    await ctx.db.patch(teamId, {
      autoPaused: true,
      pendingPollBurst: {
        type: 'auto' as const,
        kind: 'pass' as const,
        runnerId: undefined,
        startedAt,
        attempt: 0,
        maxAttempts: 1,
        lastSeenChronoLapNumber,
      },
      updatedAt: Date.now(),
    } as any)
    await ctx.scheduler.runAfter(STUCK_RETRY_INTERVAL_MS, internal.chronoplace.pollBurstStep, {
      teamId,
      burstStartedAt: startedAt,
    })
    return { startedAt }
  },
})

// Clear autoPaused once a stuck team resumes sending data.
export const clearAutoPaused = internalMutation({
  args: { teamId: v.id('teams') },
  handler: async (ctx, { teamId }) => {
    const team = await ctx.db.get(teamId)
    if (!team) return
    if ((team as any).autoPaused) {
      await ctx.db.patch(teamId, { autoPaused: false, updatedAt: Date.now() } as any)
    }
  },
})

// Compute next theoretical lap timestamp and arm an auto burst at that time.
// Called after each successful lap discovery to keep the chain alive. Skips scheduling
// when no viewer is present so a race with no audience consumes zero Convex compute;
// the chain resumes via `presence.beat()` → `wakeChains` when someone opens the app.
export const scheduleNextAutoBurst = internalMutation({
  args: { teamId: v.id('teams') },
  handler: async (ctx, { teamId }) => {
    const team = await ctx.db.get(teamId)
    if (!team) return null
    if ((team as any).finishedAt) return null
    if (!(team as any).chronoSyncEnabled) return null

    const event = await ctx.db.get(team.eventId)
    if (!event || event.status !== 'running' || (event as any).actualEnd) return null

    const hasViewers = await ctx.runQuery(internal.presence.hasViewers, {
      eventId: team.eventId,
    })
    if (!hasViewers) {
      // No fresh viewer → don't schedule. Clear pendingPollBurst so the UI doesn't
      // show a phantom "burst armed" state while the chain is dormant.
      await ctx.db.patch(teamId, { pendingPollBurst: undefined, updatedAt: Date.now() } as any)
      return { skipped: 'no_viewers' as const }
    }

    const runners = await ctx.db
      .query('runners')
      .withIndex('by_team', (q) => q.eq('teamId', teamId))
      .collect()
    const noRunners = runners.length === 0

    const orderDoc = await ctx.db
      .query('teamOrder')
      .withIndex('by_team', (q) => q.eq('teamId', teamId))
      .first()
    const orderArr: string[] = noRunners
      ? []
      : (orderDoc && orderDoc.order && orderDoc.order.length > 0
          ? orderDoc.order
          : runners.map((r: any) => r.id))

    const currentRunnerLocalId = orderArr.length > 0 && (team.currentIdx || 0) < orderArr.length
      ? orderArr[team.currentIdx || 0]
      : ''
    const runner: any = currentRunnerLocalId ? runners.find((r: any) => r.id === currentRunnerLocalId) : null

    // Determine if upcoming lap is a relay (runner-aware; noRunners → never relay).
    const allTeamLaps = await ctx.db
      .query('laps')
      .withIndex('by_team', (q) => q.eq('teamId', teamId))
      .collect()
    const sortedDesc = [...allTeamLaps].sort((a: any, b: any) => b.timestamp - a.timestamp)
    let lapsThisStint = 0
    if (runner) {
      for (const l of sortedDesc) {
        if (l.type === 'relay_manual' || l.type === 'relay_auto') break
        if (l.runnerId === currentRunnerLocalId) lapsThisStint++
      }
    }
    const planned = runner?.plannedLaps ?? 4
    const upcomingIsRelay = !!runner && lapsThisStint + 1 >= planned

    const tDecide = getEffectiveTimings(event)
    const lastLap = sortedDesc[0]
    const isFirstEverLap = !lastLap
    const lapDistanceForExpected = isFirstEverLap
      ? ((event as any).firstLapDistanceM ?? (event as any).lapDistance ?? LAP_DISTANCE_M)
      : ((event as any).lapDistance ?? LAP_DISTANCE_M)

    // Cascade priorité expectedLapMs (mock = course déjà passée, valeurs API connues):
    //  0. mock peek direct (testMode + slug mock) — TOUJOURS calculé from raw data
    //     (pas depuis team.nextExpectedLapMs qui peut être stale ou pas encore patché)
    //  1. lastLap.lapTime (API value du tour précédent — fallback)
    //  2. runner théorique relay-override
    //  3. runner live calibré
    //  4. runner config kmMin/Sec (scaled by divider en test)
    //  5. fallback default 6'00/km divisé
    let expectedLapMs: number
    const isMockTeamEarly = shouldUseMockChronoplace(
      (team as any).chronoplaceSlug,
      (event as any).testMode,
    )
    const upcomingLapNumberEarly = (lastLap?.lapNumber || 0) + 1
    const peekEarly = isMockTeamEarly
      ? getMockNextLapTimeMs(
          (team as any).chronoplaceSlug,
          upcomingLapNumberEarly,
          tDecide.testModeDivider,
        )
      : null
    if (peekEarly && peekEarly > 0) {
      const offsetMs = upcomingIsRelay ? tDecide.relayTransitionSec * 1000 : 0
      expectedLapMs = peekEarly + offsetMs
    } else if (lastLap && lastLap.lapTime > 0) {
      // Source 1: API précédente
      const wasRelay = lastLap.type === 'relay_manual' || lastLap.type === 'relay_auto'
      const stripped = wasRelay ? Math.max(MIN_LAP_GAP_MS, lastLap.lapTime - tDecide.relayTransitionSec * 1000) : lastLap.lapTime
      const offsetMs = upcomingIsRelay ? tDecide.relayTransitionSec * 1000 : 0
      expectedLapMs = stripped + offsetMs
    } else if (runner) {
      // Sources 2-4: runner config / live / theoretical
      const liveLapMs =
        runner.liveKmMin != null && runner.liveKmSec != null
          ? kmPaceToLapMs(runner.liveKmMin, runner.liveKmSec, lapDistanceForExpected)
          : 0
      const liveOk = liveLapMs >= MIN_LAP_GAP_MS
      const hasRelayOverride =
        upcomingIsRelay && runner.theoreticalRelayPaceMin != null && runner.theoreticalRelayPaceSec != null
      let kmMin: number
      let kmSec: number
      let scaleByDivider: boolean
      if (hasRelayOverride) {
        kmMin = runner.theoreticalRelayPaceMin
        kmSec = runner.theoreticalRelayPaceSec
        scaleByDivider = false
      } else if (liveOk) {
        kmMin = runner.liveKmMin
        kmSec = runner.liveKmSec
        scaleByDivider = false
      } else {
        kmMin = runner.kmMin ?? 6
        kmSec = runner.kmSec ?? 0
        scaleByDivider = tDecide.testMode
      }
      const paceSec = (kmMin * 60 + kmSec) / (scaleByDivider ? tDecide.testModeDivider : 1)
      const baseExpectedLapMs = Math.round((paceSec * lapDistanceForExpected) / 1000) * 1000
      const offsetMs = upcomingIsRelay && !hasRelayOverride ? tDecide.relayTransitionSec * 1000 : 0
      expectedLapMs = baseExpectedLapMs + offsetMs
    } else {
      // Source 5: fallback default uniquement pour 1er tour d'équipe sans roster
      const defaultPaceSec = 360 / (tDecide.testMode ? tDecide.testModeDivider : 1)
      expectedLapMs = Math.round((defaultPaceSec * lapDistanceForExpected) / 1000) * 1000
    }

    const refTs = lastLap ? lastLap.timestamp : (event as any).actualStart
    if (!refTs) return null

    const fireAt = refTs + expectedLapMs
    const startedAt = fireAt
    const lastSeenChronoLapNumber = allTeamLaps.reduce(
      (max: number, l: any) => (l.chronoplaceId ? Math.max(max, l.lapNumber || 0) : max),
      0,
    )
    // Mock testMode: nextExpectedLapMs (peek mock) déjà calculé via peekEarly plus haut.
    const isMockTeam = isMockTeamEarly
    const upcomingLapNumber = lastSeenChronoLapNumber + 1
    const peekUpcoming = peekEarly
    const peekUpcomingMeta = isMockTeam
      ? getMockLapMeta(
          (team as any).chronoplaceSlug,
          upcomingLapNumber,
          (event as any).actualStart || 0,
          tDecide.testModeDivider,
        )
      : null

    await ctx.db.patch(teamId, {
      pendingPollBurst: {
        type: 'auto' as const,
        kind: upcomingIsRelay ? ('relay' as const) : ('pass' as const),
        runnerId: undefined,
        startedAt,
        attempt: 0,
        maxAttempts: maxAttemptsForBurst('auto', tDecide.testModeDivider),
        lastSeenChronoLapNumber,
      },
      nextExpectedLapMs: peekUpcoming ?? undefined,
      nextExpectedChronoplaceId: peekUpcomingMeta?.chronoplaceId ?? undefined,
      updatedAt: Date.now(),
    } as any)
    const delay = Math.max(0, fireAt - Date.now())
    // Mock testMode: bypass poll burst — schedule direct insertion at reveal time.
    // L'API mock connaît déjà toutes les valeurs → on évite le polling et on insère
    // pile au moment où le tour est sensé être révélé. Garantit ~0ms de latence.
    if (isMockTeam && peekUpcoming != null) {
      await ctx.scheduler.runAfter(delay, internal.chronoplace.directApplyMockLap, {
        teamId,
        lapNumber: upcomingLapNumber,
        burstStartedAt: startedAt,
      })
    } else {
      await ctx.scheduler.runAfter(delay, internal.chronoplace.pollBurstStep, {
        teamId,
        burstStartedAt: startedAt,
      })
    }
    return { startedAt, fireAt, upcomingIsRelay }
  },
})

// ─── Burst polling action ──────────────────────────────────────────────────

// The single recursive step of a burst. Reads current state, decides what to do, and
// either applies a discovered lap or reschedules itself after POLL_INTERVAL_MS.
// Direct mock insertion — bypass burst polling for mock testMode teams. Fires once
// at the predicted reveal time with the exact lap data from the mock dataset.
// Idempotent via applyChronoplaceLap chronoplaceId guard.
export const directApplyMockLap = internalAction({
  args: {
    teamId: v.id('teams'),
    lapNumber: v.number(),
    burstStartedAt: v.number(),
  },
  handler: async (ctx, { teamId, lapNumber, burstStartedAt }) => {
    const sctx: any = await ctx.runQuery(internal.chronoplace.getTeamSyncContext, { teamId })
    if (!sctx) return { ok: false, reason: 'no_team' }
    const burst = sctx.pendingPollBurst
    if (!burst || burst.startedAt !== burstStartedAt) return { ok: false, reason: 'stale' }
    if (sctx.eventStatus !== 'running' || sctx.actualEnd) {
      await ctx.runMutation(internal.chronoplace.clearBurst, { teamId, burstStartedAt })
      return { ok: false, reason: 'event_not_running' }
    }
    const meta = getMockLapMeta(
      sctx.chronoplaceSlug,
      lapNumber,
      sctx.actualStart || 0,
      sctx.testModeDivider || 3,
    )
    if (!meta) {
      await ctx.runMutation(internal.chronoplace.clearBurst, { teamId, burstStartedAt })
      return { ok: false, reason: 'no_more_laps' }
    }
    await ctx.runMutation(internal.chronoplace.applyChronoplaceLap, {
      teamId,
      chronoplaceId: meta.chronoplaceId,
      lapNumber,
      lapTimeMs: meta.lapTimeMs,
      createdAtMs: meta.revealAtMs,
      rang: meta.rang,
      manualTag:
        burst.type === 'manual'
          ? { kind: burst.kind, runnerId: burst.runnerId }
          : undefined,
    })
    await ctx.runMutation(internal.chronoplace.markSyncResult, { teamId, error: undefined })
    await ctx.runMutation(internal.chronoplace.clearBurst, { teamId, burstStartedAt })
    await ctx.runMutation(internal.chronoplace.clearAutoPaused, { teamId })
    await ctx.runMutation(internal.chronoplace.scheduleNextAutoBurst, { teamId })
    return { ok: true, lapNumber }
  },
})

export const pollBurstStep = internalAction({
  args: { teamId: v.id('teams'), burstStartedAt: v.number() },
  handler: async (ctx, { teamId, burstStartedAt }) => {
    const sctx: any = await ctx.runQuery(internal.chronoplace.getTeamSyncContext, { teamId })
    if (!sctx) return { ok: false, reason: 'no_team' }
    const burst = sctx.pendingPollBurst
    if (!burst || burst.startedAt !== burstStartedAt) return { ok: false, reason: 'stale' }
    if (sctx.eventStatus !== 'running' || sctx.actualEnd) {
      await ctx.runMutation(internal.chronoplace.clearBurst, { teamId, burstStartedAt })
      return { ok: false, reason: 'event_not_running' }
    }
    if (!sctx.chronoplaceEventId || !sctx.chronoplaceSlug) {
      await ctx.runMutation(internal.chronoplace.clearBurst, { teamId, burstStartedAt })
      return { ok: false, reason: 'no_chronoplace_config' }
    }

    const newAttempt = (burst.attempt as number) + 1
    if (newAttempt > burst.maxAttempts) {
      await ctx.runMutation(internal.chronoplace.clearBurst, { teamId, burstStartedAt })
      // Burst window expired empty-handed. The runner is presumed stopped or has lost
      // the Chronoplace chip — pause the team and start a 60s retry loop until a new
      // lap finally appears (or someone hits "Sync maintenant" to force it earlier).
      await ctx.runMutation(internal.chronoplace.armStuckRetry, { teamId })
      return { ok: false, reason: 'stuck_retry_armed' }
    }
    await ctx.runMutation(internal.chronoplace.bumpBurstAttempt, {
      teamId,
      burstStartedAt,
      attempt: newAttempt,
    })

    // Retry mode (stuck): single-shot bursts spaced by STUCK_RETRY_INTERVAL_MS while
    // autoPaused. Detected via the burst's maxAttempts === 1 (set by armStuckRetry).
    const isStuckRetry = burst.maxAttempts === 1
    const nextIntervalMs = isStuckRetry ? STUCK_RETRY_INTERVAL_MS : POLL_INTERVAL_MS

    const fetched = await fetchChronoplaceLaps(sctx)
    if (!fetched.ok) {
      await ctx.runMutation(internal.chronoplace.markSyncResult, { teamId, error: fetched.error })
      await ctx.scheduler.runAfter(nextIntervalMs, internal.chronoplace.pollBurstStep, {
        teamId,
        burstStartedAt,
      })
      return { ok: false, reason: fetched.error }
    }
    const valid = fetched.body.filter(isChronoplaceLapShape).sort((a, b) => a.nb_tours - b.nb_tours)
    const newLap = valid.find((l) => l.nb_tours > burst.lastSeenChronoLapNumber)

    if (!newLap) {
      await ctx.runMutation(internal.chronoplace.markSyncResult, { teamId, error: undefined })
      // In retry mode this single attempt counts as max — `newAttempt > maxAttempts`
      // would have caught it on the next entry, but we want a fresh 60s loop with a new
      // burst identity. So re-arm via armStuckRetry to refresh startedAt/lastSeen.
      if (isStuckRetry) {
        await ctx.runMutation(internal.chronoplace.clearBurst, { teamId, burstStartedAt })
        await ctx.runMutation(internal.chronoplace.armStuckRetry, { teamId })
        return { ok: false, reason: 'stuck_retry_continued' }
      }
      await ctx.scheduler.runAfter(nextIntervalMs, internal.chronoplace.pollBurstStep, {
        teamId,
        burstStartedAt,
      })
      return { ok: false, reason: 'no_new_lap', attempt: newAttempt }
    }

    const lapTimeMs = parseChronoplaceTime(newLap.temps)
    const createdAtMs = Date.parse(newLap.created_at)
    if (!lapTimeMs || Number.isNaN(createdAtMs)) {
      await ctx.scheduler.runAfter(nextIntervalMs, internal.chronoplace.pollBurstStep, {
        teamId,
        burstStartedAt,
      })
      return { ok: false, reason: 'parse_error' }
    }

    const applyResult: any = await ctx.runMutation(internal.chronoplace.applyChronoplaceLap, {
      teamId,
      chronoplaceId: newLap.id,
      lapNumber: newLap.nb_tours,
      lapTimeMs,
      createdAtMs,
      rang: typeof (newLap as any).rang === 'number' ? (newLap as any).rang : undefined,
      manualTag:
        burst.type === 'manual'
          ? { kind: burst.kind, runnerId: burst.runnerId }
          : undefined,
    })

    await ctx.runMutation(internal.chronoplace.markSyncResult, { teamId, error: undefined })
    await ctx.runMutation(internal.chronoplace.clearBurst, { teamId, burstStartedAt })
    // Coming out of stuck mode: clear autoPaused so the UI reflects resumed activity.
    await ctx.runMutation(internal.chronoplace.clearAutoPaused, { teamId })
    await ctx.runMutation(internal.chronoplace.scheduleNextAutoBurst, { teamId })
    return { ok: true, lapNumber: newLap.nb_tours, apply: applyResult }
  },
})

// ─── Legacy / safety-net actions ───────────────────────────────────────────

// Sync ONE team from the Chronoplace JSON API in a single shot (no burst).
// Kept as a safety-net: client polls this every 30s while a screen is open.
export const syncTeam = internalAction({
  args: { teamId: v.id('teams') },
  handler: async (ctx, { teamId }) => {
    const sctx: any = await ctx.runQuery(internal.chronoplace.getTeamSyncContext, { teamId })
    if (!sctx) return { ok: false as const, error: 'no_team' }
    if (sctx.eventStatus !== 'running' || sctx.actualEnd) {
      return { ok: false as const, error: 'event_not_running' }
    }
    if (!sctx.chronoplaceEventId) {
      await ctx.runMutation(internal.chronoplace.markSyncResult, { teamId, error: 'no_event_id' })
      return { ok: false as const, error: 'no_event_id' }
    }
    if (!sctx.chronoplaceSlug) {
      await ctx.runMutation(internal.chronoplace.markSyncResult, { teamId, error: 'no_slug' })
      return { ok: false as const, error: 'no_slug' }
    }

    const fetched = await fetchChronoplaceLaps(sctx)
    if (!fetched.ok) {
      await ctx.runMutation(internal.chronoplace.markSyncResult, { teamId, error: fetched.error })
      return { ok: false as const, error: fetched.error }
    }
    const valid = fetched.body.filter(isChronoplaceLapShape).sort((a, b) => a.nb_tours - b.nb_tours)
    let inserted = 0
    let overwritten = 0
    let skipped = 0
    for (const lap of valid) {
      const lapTimeMs = parseChronoplaceTime(lap.temps)
      const createdAtMs = Date.parse(lap.created_at)
      if (!lapTimeMs || Number.isNaN(createdAtMs)) {
        skipped++
        continue
      }
      const result: any = await ctx.runMutation(internal.chronoplace.applyChronoplaceLap, {
        teamId,
        chronoplaceId: lap.id,
        lapNumber: lap.nb_tours,
        lapTimeMs,
        createdAtMs,
        rang: typeof (lap as any).rang === 'number' ? (lap as any).rang : undefined,
      })
      if (result.kind === 'insert') inserted++
      else if (result.kind === 'overwrite') overwritten++
      else skipped++
    }

    await ctx.runMutation(internal.chronoplace.markSyncResult, { teamId, error: undefined })
    return { ok: true as const, total: valid.length, inserted, overwritten, skipped }
  },
})

// Public action: triggered from AdminScreen "🔄 Sync maintenant".
export const forceSyncTeam = action({
  args: { teamId: v.id('teams') },
  handler: async (ctx, { teamId }): Promise<any> => {
    return await ctx.runAction(internal.chronoplace.syncTeam, { teamId })
  },
})

// Public action: client-driven 30s safety net (LiveScreen/AdminScreen).
export const dispatchSync = action({
  args: {},
  handler: async (ctx): Promise<{ count: number; results: any[] }> => {
    const eligible: any[] = await ctx.runQuery(internal.chronoplace.listEligibleTeams, {})
    const results: any[] = []
    for (const t of eligible) {
      try {
        const r: any = await ctx.runAction(internal.chronoplace.syncTeam, { teamId: t.teamId })
        results.push({ teamId: t.teamId, ...r })
      } catch (e: any) {
        results.push({ teamId: t.teamId, ok: false, error: String(e?.message || e) })
      }
    }
    return { count: eligible.length, results }
  },
})

// ─── Public bootstrap action ───────────────────────────────────────────────

// Public: arm a manual burst from the client (called by recordLap when team is on Chronoplace).
export const triggerManualBurst = action({
  args: {
    teamId: v.id('teams'),
    kind: v.union(v.literal('pass'), v.literal('relay')),
    runnerId: v.optional(v.string()),
  },
  handler: async (ctx, { teamId, kind, runnerId }): Promise<any> => {
    return await ctx.runMutation(internal.chronoplace.armBurst, {
      teamId,
      type: 'manual',
      kind,
      runnerId,
    })
  },
})

// Public: schedule the first auto burst (or refresh it) — called by the admin when
// enabling chronoSync on a team or starting the race.
export const bootstrapAutoBurst = action({
  args: { teamId: v.id('teams') },
  handler: async (ctx, { teamId }): Promise<any> => {
    return await ctx.runMutation(internal.chronoplace.scheduleNextAutoBurst, { teamId })
  },
})
