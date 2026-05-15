import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { computeNextRunnerIdx, consumeQueueOnRelay, type GroupModeEntry } from './lib/nextRunner'
import { getEffectiveTimings } from './lib/timings'

// Min interval between two laps for the same team (debounce)
const MIN_LAP_GAP_MS = 5000

type LapType = 'checkpoint_manual' | 'relay_manual' | 'checkpoint_auto' | 'relay_auto'

// Get laps for a team
export const getLaps = query({
  args: { teamId: v.id('teams') },
  handler: async (ctx, args) => {
    const laps = await ctx.db
      .query('laps')
      .withIndex('by_team', (q) => q.eq('teamId', args.teamId))
      .collect()
    return laps.sort((a, b) => a.timestamp - b.timestamp)
  },
})

// Get all laps for an event (used by dashboard / leaderboard)
export const getLapsByEvent = query({
  args: { eventId: v.id('events') },
  handler: async (ctx, args) => {
    const teams = await ctx.db
      .query('teams')
      .withIndex('by_event', (q) => q.eq('eventId', args.eventId))
      .collect()
    const teamIds = new Set(teams.map((t) => t._id))
    const allLaps = await ctx.db.query('laps').collect()
    return allLaps
      .filter((l) => teamIds.has(l.teamId))
      .sort((a, b) => a.timestamp - b.timestamp)
  },
})

// Manual record (top passage or relai)
// If the most recent lap is an auto type within the configured window, REPLACE it with this manual one.
const DEFAULT_REPLACE_AUTO_WINDOW_SEC = 180

export const recordLap = mutation({
  args: {
    teamId: v.id('teams'),
    change: v.boolean(), // true = relai, false = top passage
    runnerId: v.optional(v.string()), // override: who actually crossed the line (intended manual runner)
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const team = await ctx.db.get(args.teamId)
    const event = team ? await ctx.db.get(team.eventId) : null
    const t = getEffectiveTimings(event)
    const windowMs = t.replaceAutoWindowSec * 1000
    const allTeamLaps = await ctx.db
      .query('laps')
      .withIndex('by_team', (q) => q.eq('teamId', args.teamId))
      .collect()
    const sortedDesc = allTeamLaps.sort((a: any, b: any) => b.timestamp - a.timestamp)
    const lastLap = sortedDesc[0] || null
    const minLapMs = t.minLapSec * 1000
    const isAutoLast = lastLap && (lastLap.type === 'checkpoint_auto' || lastLap.type === 'relay_auto')
    const isRelayLast = lastLap && (lastLap.type === 'relay_auto' || lastLap.type === 'relay_manual')
    // Replace only if the auto fired VERY recently (race condition window MIN_LAP_GAP_MS = 5s).
    // For tighter than minLap (test mode short laps), also replace to avoid duplicates.
    const RACE_COND_MS = MIN_LAP_GAP_MS
    const withinReplaceAutoWin = lastLap && isAutoLast && now - lastLap.timestamp <= Math.min(windowMs, RACE_COND_MS)
    const withinMinLapWin = lastLap && now - lastLap.timestamp < Math.min(minLapMs, RACE_COND_MS)

    let replaces: any = undefined
    if (lastLap && (withinReplaceAutoWin || withinMinLapWin)) {
      // Snapshot the lap we are about to delete so undo can restore it
      replaces = {
        runnerId: lastLap.runnerId,
        timestamp: lastLap.timestamp,
        lapTime: lastLap.lapTime,
        type: lastLap.type,
        lapNumber: lastLap.lapNumber,
        autoRelay: lastLap.autoRelay,
        prevCurrentIdx: (lastLap as any).prevCurrentIdx,
      }
      // Rollback currentIdx if the deleted lap was a relay (auto or manual)
      if (isRelayLast) {
        const t2 = await ctx.db.get(args.teamId)
        const order = await ctx.db
          .query('teamOrder')
          .withIndex('by_team', (q) => q.eq('teamId', args.teamId))
          .first()
        if (t2 && order && order.order.length > 0) {
          const prevIdx = ((t2.currentIdx || 0) - 1 + order.order.length) % order.order.length
          await ctx.db.patch(args.teamId, { currentIdx: prevIdx, updatedAt: now })
        }
      }
      await ctx.db.delete(lastLap._id)
    }

    // If we just deleted a relay lap (auto or manual) — the new lap belongs to the runner who was
    // ACTUALLY on track (the deleted lap's runner), not the post-relay next runner the client may have sent.
    let effectiveRunnerOverride = args.runnerId
    if (replaces && (replaces.type === 'relay_auto' || replaces.type === 'relay_manual')) {
      effectiveRunnerOverride = replaces.runnerId
    }

    const result = await applyLap(
      ctx,
      args.teamId,
      args.change ? 'relay_manual' : 'checkpoint_manual',
      { runnerOverride: effectiveRunnerOverride, bypassDebounce: true, replaces },
    )

    // Resume cron auto-tick after a manual action + arm a cooldown so the cron stays out
    // for the admin-configured window (replaceAutoWindowSec).
    const cooldownMs = t.replaceAutoWindowSec * 1000
    await ctx.db.patch(args.teamId, {
      autoPaused: false,
      cronCooldownUntil: now + cooldownMs,
      updatedAt: now,
    })

    // Server-side auto-calibration: update runner.liveKm from the manual lap time.
    // Use effective lap time bounds so test mode (short laps) calibrates too.
    if (result && args.runnerId) {
      const lapTime = (result as any).lapTime as number
      const minLapMs = t.minLapSec * 1000
      const maxLapMs = t.maxLapSec * 1000
      if (lapTime >= minLapMs && lapTime <= maxLapMs) {
        const lapDistanceM = 900
        const secPerKm = (lapTime / 1000) * (1000 / lapDistanceM)
        const min = Math.floor(secPerKm / 60)
        const sec = Math.round(secPerKm - min * 60)
        const runnersDocs = await ctx.db
          .query('runners')
          .withIndex('by_team', (q) => q.eq('teamId', args.teamId))
          .collect()
        const runnerDoc = runnersDocs.find((r) => r.id === args.runnerId)
        if (runnerDoc) {
          await ctx.db.patch(runnerDoc._id, { liveKmMin: min, liveKmSec: sec })
        }
      }
    }

    return result
  },
})

// Public: cron + client-side poller tick — for each running team, decide if a lap fires
export const autoTick = mutation({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db
      .query('events')
      .withIndex('by_status', (q) => q.eq('status', 'running'))
      .collect()

    const fired: Array<{ teamId: string; type: LapType }> = []
    const skipped: Array<{ teamId: string; reason: string }> = []

    for (const event of events) {
      // Skip if event interrupted (active race interruption)
      const activeRaceItr = await ctx.db
        .query('interruptions')
        .withIndex('by_event_kind', (q) => q.eq('eventId', event._id).eq('kind', 'race'))
        .filter((q) => q.eq(q.field('endMs'), undefined))
        .first()
      if (activeRaceItr) continue

      if (!event.actualStart) {
        skipped.push({ teamId: event._id, reason: 'no actualStart' })
        continue
      }

      const teams = await ctx.db
        .query('teams')
        .withIndex('by_event', (q) => q.eq('eventId', event._id))
        .collect()

      const tickNow = Date.now()
      for (const team of teams) {
        if (!team.ready) {
          skipped.push({ teamId: team._id, reason: 'not ready' })
          continue
        }
        if (team.autoPaused) {
          skipped.push({ teamId: team._id, reason: 'auto paused' })
          continue
        }
        if ((team as any).cronCooldownUntil && tickNow < (team as any).cronCooldownUntil) {
          skipped.push({ teamId: team._id, reason: `cron cooldown ${(team as any).cronCooldownUntil - tickNow}ms` })
          continue
        }
        try {
          const decision = await decideAutoLap(ctx, team, event.actualStart, event)
          if (!decision) {
            skipped.push({ teamId: team._id, reason: 'decideAutoLap=null' })
            continue
          }
          const res = await applyLap(ctx, team._id, decision)
          if (res) fired.push({ teamId: team._id, type: decision })
          else skipped.push({ teamId: team._id, reason: 'applyLap=null' })
        } catch (e: any) {
          skipped.push({ teamId: team._id, reason: 'error: ' + (e?.message || String(e)) })
        }
      }
    }

    return { firedCount: fired.length, fired, skipped }
  },
})

// ─── helpers ────────────────────────────────────────────────────────────────

async function decideAutoLap(
  ctx: any,
  team: any,
  raceStartMs: number | null,
  event?: any,
): Promise<LapType | null> {
  if (!raceStartMs) return null

  const runners = await ctx.db
    .query('runners')
    .withIndex('by_team', (q: any) => q.eq('teamId', team._id))
    .collect()
  if (runners.length === 0) return null

  // Order can be missing (team created via admin without seed) — fallback to runners array order
  const orderDoc = await ctx.db
    .query('teamOrder')
    .withIndex('by_team', (q: any) => q.eq('teamId', team._id))
    .first()
  const orderArr: string[] =
    orderDoc && orderDoc.order && orderDoc.order.length > 0
      ? orderDoc.order
      : runners.map((r: any) => r.id)
  if (orderArr.length === 0) return null

  const currentRunnerLocalId = orderArr[(team.currentIdx || 0) % orderArr.length]
  const runner = runners.find((r: any) => r.id === currentRunnerLocalId)
  if (!runner) return null

  // Last lap for the team (any type)
  const lastLap = await ctx.db
    .query('laps')
    .withIndex('by_team', (q: any) => q.eq('teamId', team._id))
    .collect()
    .then((arr: any[]) => (arr.length ? arr.sort((a, b) => b.timestamp - a.timestamp)[0] : null))

  const lastLapAt = lastLap ? lastLap.timestamp : raceStartMs
  const now = Date.now()
  const elapsed = now - lastLapAt
  if (elapsed < MIN_LAP_GAP_MS) throw new Error(`decide:debounce elapsed=${elapsed}<${MIN_LAP_GAP_MS}`)

  // Expected lap duration (live pace > pace estim).
  // Use effective lap-time bounds (test mode supports very short laps).
  const tDecide = getEffectiveTimings(event)
  const minLapMs = tDecide.minLapSec * 1000
  const maxLapMs = tDecide.maxLapSec * 1000
  const lapDistanceM = 900
  const liveLapMs = (runner.liveKmMin != null && runner.liveKmSec != null)
    ? Math.round(((runner.liveKmMin * 60 + runner.liveKmSec) * lapDistanceM) / 1000) * 1000
    : 0
  const liveOk = liveLapMs > 0 && liveLapMs >= minLapMs && liveLapMs <= maxLapMs
  const kmMin = liveOk ? runner.liveKmMin : (runner.kmMin ?? 6)
  const kmSec = liveOk ? runner.liveKmSec : (runner.kmSec ?? 0)
  const paceSec = kmMin * 60 + kmSec
  const baseExpectedLapMs = Math.round((paceSec * lapDistanceM) / 1000) * 1000
  // Defensive: never fire below the admin min-lap floor
  if (baseExpectedLapMs < minLapMs) throw new Error(`decide:expected too short=${baseExpectedLapMs} < ${minLapMs}`)

  // Add relay-transition penalty if the previous team lap was a relay → the current
  // upcoming lap is the first lap of the new runner (handover handled in same window).
  const prevLapForOffset = lastLap as any
  const prevWasRelay =
    prevLapForOffset && (prevLapForOffset.type === 'relay_manual' || prevLapForOffset.type === 'relay_auto')
  const offsetMs = prevWasRelay ? tDecide.relayTransitionSec * 1000 : 0
  const expectedLapMs = baseExpectedLapMs + offsetMs

  // Tolerance: only auto-trigger when expected time is reached or slightly past
  if (elapsed < expectedLapMs) throw new Error(`decide:not ready elapsed=${elapsed}<expected=${expectedLapMs} runner=${runner.name}`)

  // Count laps for this runner since last relai (relay_*)
  const lapsForRunner = await ctx.db
    .query('laps')
    .withIndex('by_team_runner', (q: any) => q.eq('teamId', team._id).eq('runnerId', currentRunnerLocalId))
    .collect()
  // Laps since last relay event (i.e. since this runner became active)
  // Rough heuristic: count laps after the most recent relay_* whose new runner = current
  const allTeamLaps = await ctx.db
    .query('laps')
    .withIndex('by_team', (q: any) => q.eq('teamId', team._id))
    .collect()
  const sortedDesc = allTeamLaps.sort((a: any, b: any) => b.timestamp - a.timestamp)
  let lapsThisStint = 0
  for (const l of sortedDesc) {
    if (l.type === 'relay_manual' || l.type === 'relay_auto') break
    if (l.runnerId === currentRunnerLocalId) lapsThisStint++
  }
  // include the lap we are about to add
  const upcomingStint = lapsThisStint + 1

  const planned = runner.plannedLaps ?? 4
  void lapsForRunner
  return upcomingStint >= planned ? 'relay_auto' : 'checkpoint_auto'
}

async function applyLap(
  ctx: any,
  teamId: any,
  type: LapType,
  opts: { runnerOverride?: string; bypassDebounce?: boolean; replaces?: any } = {},
) {
  const team = await ctx.db.get(teamId)
  if (!team) return null

  const runners = await ctx.db
    .query('runners')
    .withIndex('by_team', (q: any) => q.eq('teamId', teamId))
    .collect()
  if (runners.length === 0) return null

  const orderDoc = await ctx.db
    .query('teamOrder')
    .withIndex('by_team', (q: any) => q.eq('teamId', teamId))
    .first()
  const orderArr: string[] =
    orderDoc && orderDoc.order && orderDoc.order.length > 0
      ? orderDoc.order
      : runners.map((r: any) => r.id)
  if (orderArr.length === 0) return null
  const order = { order: orderArr }

  // Debounce — prevent same-team double laps (manual click can bypass)
  const allTeamLaps = await ctx.db
    .query('laps')
    .withIndex('by_team', (q: any) => q.eq('teamId', teamId))
    .collect()
  const sortedDesc = allTeamLaps.sort((a: any, b: any) => b.timestamp - a.timestamp)
  const lastLap = sortedDesc[0] || null
  const now = Date.now()
  if (!opts.bypassDebounce && lastLap && now - lastLap.timestamp < MIN_LAP_GAP_MS) return null

  const event = await ctx.db.get(team.eventId)
  const raceStartMs = event?.actualStart || null
  const refTs = lastLap ? lastLap.timestamp : raceStartMs
  if (!refTs) return null

  const lapTime = now - refTs
  const lapNumber = allTeamLaps.length + 1
  // Manual override: client passes the runner intended to be credited
  const currentRunnerLocalId = opts.runnerOverride && runners.find((r: any) => r.id === opts.runnerOverride)
    ? opts.runnerOverride
    : order.order[(team.currentIdx || 0) % order.order.length]
  const isRelay = type === 'relay_manual' || type === 'relay_auto'
  const isAuto = type === 'checkpoint_auto' || type === 'relay_auto'

  const lapId = 'lap_' + now + '_' + teamId
  // Snapshot team.currentIdx BEFORE this lap (after any prior auto-replace rollback) so undo can restore.
  const teamFresh = await ctx.db.get(teamId)
  const prevCurrentIdx = teamFresh?.currentIdx ?? 0
  const prevGroupModeQueue = ((teamFresh as any)?.groupModeQueue || undefined) as GroupModeEntry[] | undefined
  // Snapshot runner.plannedLaps at insert time (for tour +/- badges later, immune to runner config edits)
  const runnerForLap = runners.find((r: any) => r.id === currentRunnerLocalId)
  const plannedAtStart = runnerForLap?.plannedLaps ?? undefined
  // Snapshot relay transition flag if the PREVIOUS team lap was a relay (handover penalty
  // applies to the very first lap of the next runner only). Reads kept untouched lapsAfterReplace
  // since 'allTeamLaps' was loaded earlier in this handler — re-fetch is overkill for current scope.
  const teamLapsForFlag = await ctx.db
    .query('laps')
    .withIndex('by_team', (q: any) => q.eq('teamId', teamId))
    .collect()
  const prevTeamLap = teamLapsForFlag
    .filter((l: any) => l.type !== 'position')
    .sort((a: any, b: any) => b.timestamp - a.timestamp)[0]
  const prevWasRelay = prevTeamLap && (prevTeamLap.type === 'relay_manual' || prevTeamLap.type === 'relay_auto')
  const eventForFlag = await ctx.db.get(team.eventId)
  const tApply = getEffectiveTimings(eventForFlag)
  const isFirstAfterRelay = prevWasRelay ? true : undefined
  const relayTransitionMsApplied = prevWasRelay ? tApply.relayTransitionSec * 1000 : undefined

  const docId = await ctx.db.insert('laps', {
    teamId,
    runnerId: currentRunnerLocalId,
    id: lapId,
    lapNumber,
    timestamp: now,
    lapTime,
    type,
    autoRelay: isAuto && isRelay ? true : undefined,
    prevCurrentIdx,
    plannedAtStart,
    replaces: opts.replaces,
    prevGroupModeQueue,
    isFirstAfterRelay,
    relayTransitionMsApplied,
  })

  if (isRelay) {
    // Compute next runner via shared helper — respects group-mode active entry if any
    const nextIdx = computeNextRunnerIdx({
      order: order.order,
      runners: runners as any,
      currentIdx: prevCurrentIdx,
      groupModeQueue: prevGroupModeQueue || null,
    })
    const nextRunnerLocalId = order.order[nextIdx]
    const nextRunnerDoc = runners.find((r: any) => r.id === nextRunnerLocalId)
    // Consume queue (decrement remainingRelays, recompute head status)
    const newQueue = consumeQueueOnRelay(prevGroupModeQueue, nextRunnerDoc as any)
    await ctx.db.patch(teamId, {
      currentIdx: nextIdx,
      updatedAt: now,
      groupModeQueue: newQueue,
    })
    // Reset incoming runner's live pace so they start the relay on their configured target (kmMin/kmSec)
    if (nextRunnerDoc) {
      await ctx.db.patch(nextRunnerDoc._id, { liveKmMin: undefined, liveKmSec: undefined })
    }
  } else {
    await ctx.db.patch(teamId, { updatedAt: now })
  }

  return { lapId, docId, type, lapNumber, lapTime }
}

// Update a lap. lapTime can be passed explicitly, else recomputed from previous lap timestamp.
export const updateLap = mutation({
  args: {
    lapId: v.id('laps'),
    lapTime: v.optional(v.number()),
    runnerId: v.optional(v.string()),
    timestamp: v.optional(v.number()),
    forcedExtra: v.optional(v.boolean()),
    type: v.optional(v.union(
      v.literal('checkpoint_manual'),
      v.literal('relay_manual'),
      v.literal('checkpoint_auto'),
      v.literal('relay_auto'),
    )),
  },
  handler: async (ctx, args) => {
    const lap = await ctx.db.get(args.lapId)
    if (!lap) return null
    const patch: Record<string, any> = {}
    if (args.runnerId !== undefined) patch.runnerId = args.runnerId
    if (args.forcedExtra !== undefined) patch.forcedExtra = args.forcedExtra
    if (args.type !== undefined) patch.type = args.type
    if (args.timestamp !== undefined) patch.timestamp = args.timestamp
    if (args.lapTime !== undefined && args.lapTime > 0) {
      patch.lapTime = args.lapTime
    } else if (args.timestamp !== undefined) {
      // Recompute lapTime from previous lap of same team
      const allLaps = await ctx.db
        .query('laps')
        .withIndex('by_team', (q) => q.eq('teamId', lap.teamId))
        .collect()
      const sorted = allLaps.filter((l) => l._id !== args.lapId).sort((a, b) => a.timestamp - b.timestamp)
      const prev = sorted.filter((l) => l.timestamp < args.timestamp!).pop()
      const event: any = await ctx.db.get(lap.teamId).then((t: any) => (t ? ctx.db.get(t.eventId) : null))
      const refTs = prev ? prev.timestamp : (event?.actualStart || args.timestamp)
      patch.lapTime = Math.max(0, args.timestamp! - refTs)
    }
    if (Object.keys(patch).length > 0) await ctx.db.patch(args.lapId, patch)
    return args.lapId
  },
})

// Insert a lap relative to an existing lap (above or below in chronological order).
// lapTime auto-computed from previous lap timestamp on the team.
export const insertLapAt = mutation({
  args: {
    teamId: v.id('teams'),
    runnerId: v.string(),
    timestamp: v.number(),
    type: v.union(
      v.literal('checkpoint_manual'),
      v.literal('relay_manual'),
      v.literal('checkpoint_auto'),
      v.literal('relay_auto'),
    ),
    forcedExtra: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const allLaps = await ctx.db
      .query('laps')
      .withIndex('by_team', (q) => q.eq('teamId', args.teamId))
      .collect()
    const sorted = allLaps.sort((a, b) => a.timestamp - b.timestamp)
    const prev = sorted.filter((l) => l.timestamp < args.timestamp).pop()
    const team = await ctx.db.get(args.teamId)
    const event = team ? await ctx.db.get(team.eventId) : null
    const refTs = prev ? prev.timestamp : (event?.actualStart || args.timestamp)
    const lapTime = Math.max(0, args.timestamp - refTs)
    const lapNumber = sorted.filter((l) => l.timestamp <= args.timestamp).length + 1
    const lapId = 'lap_' + args.timestamp + '_' + args.teamId
    const isAuto = args.type === 'checkpoint_auto' || args.type === 'relay_auto'
    const isRelay = args.type === 'relay_manual' || args.type === 'relay_auto'
    return await ctx.db.insert('laps', {
      teamId: args.teamId,
      runnerId: args.runnerId,
      id: lapId,
      lapNumber,
      timestamp: args.timestamp,
      lapTime,
      type: args.type,
      autoRelay: isAuto && isRelay ? true : undefined,
      forcedExtra: args.forcedExtra,
    })
  },
})

// Bulk add a relay: N laps for a single runner with given per-lap time, anchored to start or end time.
// Existing laps within ±toleranceMs of computed timestamps are UPDATED instead of duplicated.
export const addBulkRelay = mutation({
  args: {
    teamId: v.id('teams'),
    runnerId: v.string(),
    lapTimeMs: v.number(),
    anchorMs: v.number(),
    anchorKind: v.union(v.literal('start'), v.literal('end')),
    nbLaps: v.number(),
    toleranceMs: v.optional(v.number()),
    approximate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const N = Math.max(1, Math.round(args.nbLaps))
    const lapMs = Math.max(1000, Math.round(args.lapTimeMs))
    const tol = Math.max(500, args.toleranceMs ?? 8000)
    // Build target timestamps for each of the N laps (chronological order)
    const targets: number[] = []
    if (args.anchorKind === 'start') {
      for (let i = 1; i <= N; i++) targets.push(args.anchorMs + i * lapMs)
    } else {
      // 'end' anchor → last lap is at anchorMs, going backward
      for (let i = N - 1; i >= 0; i--) targets.push(args.anchorMs - i * lapMs)
    }
    const allTeamLaps = await ctx.db
      .query('laps')
      .withIndex('by_team', (q) => q.eq('teamId', args.teamId))
      .collect()
    const used = new Set<string>()
    const results: Array<{ kind: 'updated' | 'inserted'; lapId: string }> = []
    for (let i = 0; i < N; i++) {
      const targetTs = targets[i]
      const isRelay = i === N - 1
      const type: LapType = isRelay ? 'relay_manual' : 'checkpoint_manual'
      // Find existing lap for this runner within tolerance
      const existing = allTeamLaps.find(
        (l) =>
          !used.has(l._id) &&
          l.runnerId === args.runnerId &&
          Math.abs(l.timestamp - targetTs) <= tol,
      )
      if (existing) {
        used.add(existing._id)
        await ctx.db.patch(existing._id, {
          timestamp: targetTs,
          lapTime: lapMs,
          type,
          forcedExtra: undefined,
          approximate: args.approximate || undefined,
        })
        results.push({ kind: 'updated', lapId: existing._id })
      } else {
        const newId = await ctx.db.insert('laps', {
          teamId: args.teamId,
          runnerId: args.runnerId,
          id: 'lap_' + targetTs + '_' + args.teamId + '_' + i,
          lapNumber: 0, // recomputed below
          timestamp: targetTs,
          lapTime: lapMs,
          type,
          approximate: args.approximate || undefined,
        })
        results.push({ kind: 'inserted', lapId: newId })
      }
    }
    // Renumber laps for the team in chronological order
    const fresh = await ctx.db
      .query('laps')
      .withIndex('by_team', (q) => q.eq('teamId', args.teamId))
      .collect()
    fresh.sort((a, b) => a.timestamp - b.timestamp)
    for (let i = 0; i < fresh.length; i++) {
      if (fresh[i].lapNumber !== i + 1) {
        await ctx.db.patch(fresh[i]._id, { lapNumber: i + 1 })
      }
    }
    // Advance team.currentIdx if last inserted lap is a relay
    const team = await ctx.db.get(args.teamId)
    const order = await ctx.db
      .query('teamOrder')
      .withIndex('by_team', (q) => q.eq('teamId', args.teamId))
      .first()
    if (team && order && order.order.length > 0) {
      const nextIdx = ((team.currentIdx || 0) + 1) % order.order.length
      await ctx.db.patch(args.teamId, { currentIdx: nextIdx, updatedAt: Date.now() })
    }
    return { results, count: results.length }
  },
})

// Delete a lap (admin / undo). Restores team.currentIdx + re-inserts replaced lap if any.
export const deleteLap = mutation({
  args: { lapId: v.id('laps') },
  handler: async (ctx, args) => {
    const lap = await ctx.db.get(args.lapId)
    if (!lap) return null
    const now = Date.now()
    const replaces = (lap as any).replaces
    const snapshotPrevIdx = (lap as any).prevCurrentIdx as number | undefined

    // Delete the lap first
    await ctx.db.delete(args.lapId)

    // Arm cron cooldown so cron doesn't immediately re-fire after undo (gives user time to redo manually)
    const team = await ctx.db.get(lap.teamId)
    const event = team ? await ctx.db.get(team.eventId) : null
    const tUndo = getEffectiveTimings(event)
    const cooldownMs = tUndo.replaceAutoWindowSec * 1000
    await ctx.db.patch(lap.teamId, { cronCooldownUntil: now + cooldownMs })

    // Restore team.currentIdx + groupModeQueue using the snapshot taken at insert time (most accurate)
    const prevGroupQueue = (lap as any).prevGroupModeQueue
    if (snapshotPrevIdx != null) {
      await ctx.db.patch(lap.teamId, {
        currentIdx: snapshotPrevIdx,
        groupModeQueue: prevGroupQueue ?? undefined,
        updatedAt: now,
      })
    } else if (lap.type === 'relay_manual' || lap.type === 'relay_auto') {
      // Legacy laps without snapshot — fall back to simple decrement
      const team = await ctx.db.get(lap.teamId)
      const order = await ctx.db
        .query('teamOrder')
        .withIndex('by_team', (q) => q.eq('teamId', lap.teamId))
        .first()
      if (team && order && order.order.length > 0) {
        const prevIdx = ((team.currentIdx || 0) - 1 + order.order.length) % order.order.length
        await ctx.db.patch(lap.teamId, { currentIdx: prevIdx, updatedAt: now })
      }
    }

    // Re-insert the replaced (auto) lap if any
    if (replaces) {
      const restoredId = 'lap_' + replaces.timestamp + '_' + lap.teamId + '_restored'
      await ctx.db.insert('laps', {
        teamId: lap.teamId,
        runnerId: replaces.runnerId,
        id: restoredId,
        lapNumber: replaces.lapNumber,
        timestamp: replaces.timestamp,
        lapTime: replaces.lapTime,
        type: replaces.type,
        autoRelay: replaces.autoRelay,
        prevCurrentIdx: replaces.prevCurrentIdx,
      })
      // If the restored lap was a relay, advance currentIdx accordingly (mirrors recordLap relay advance)
      if (replaces.type === 'relay_auto' || replaces.type === 'relay_manual') {
        const order = await ctx.db
          .query('teamOrder')
          .withIndex('by_team', (q) => q.eq('teamId', lap.teamId))
          .first()
        if (order && order.order.length > 0 && replaces.prevCurrentIdx != null) {
          const advancedIdx = (replaces.prevCurrentIdx + 1) % order.order.length
          await ctx.db.patch(lap.teamId, { currentIdx: advancedIdx, updatedAt: now })
        }
      }
    }
    return args.lapId
  },
})
