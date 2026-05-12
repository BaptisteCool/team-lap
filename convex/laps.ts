import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

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
// If the most recent lap is an auto type within the last 60s, REPLACE it with this manual one.
const REPLACE_AUTO_WINDOW_MS = 60_000

export const recordLap = mutation({
  args: {
    teamId: v.id('teams'),
    change: v.boolean(), // true = relai, false = top passage
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const allTeamLaps = await ctx.db
      .query('laps')
      .withIndex('by_team', (q) => q.eq('teamId', args.teamId))
      .collect()
    const sortedDesc = allTeamLaps.sort((a, b) => b.timestamp - a.timestamp)
    const lastLap = sortedDesc[0] || null
    const isAutoLast = lastLap && (lastLap.type === 'checkpoint_auto' || lastLap.type === 'relay_auto')
    const withinWindow = lastLap && now - lastLap.timestamp <= REPLACE_AUTO_WINDOW_MS

    if (lastLap && isAutoLast && withinWindow) {
      // Rollback currentIdx if the deleted auto lap was a relay
      if (lastLap.type === 'relay_auto') {
        const team = await ctx.db.get(args.teamId)
        const order = await ctx.db
          .query('teamOrder')
          .withIndex('by_team', (q) => q.eq('teamId', args.teamId))
          .first()
        if (team && order && order.order.length > 0) {
          const prevIdx = ((team.currentIdx || 0) - 1 + order.order.length) % order.order.length
          await ctx.db.patch(args.teamId, { currentIdx: prevIdx, updatedAt: now })
        }
      }
      await ctx.db.delete(lastLap._id)
    }

    const result = await applyLap(ctx, args.teamId, args.change ? 'relay_manual' : 'checkpoint_manual')
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

      for (const team of teams) {
        if (!team.ready) {
          skipped.push({ teamId: team._id, reason: 'not ready' })
          continue
        }
        try {
          const decision = await decideAutoLap(ctx, team, event.actualStart)
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
  raceStartMs: number | null
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

  // Expected lap duration (live pace > pace estim > fallback 6:00/km)
  const kmMin = runner.liveKmMin ?? runner.kmMin ?? 6
  const kmSec = runner.liveKmSec ?? runner.kmSec ?? 0
  const lapDistanceM = 900
  const paceSec = kmMin * 60 + kmSec
  const expectedLapMs = Math.round((paceSec * lapDistanceM) / 1000) * 1000
  if (expectedLapMs <= 0) throw new Error(`decide:expectedLapMs<=0 kmMin=${kmMin} kmSec=${kmSec}`)

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
  const sortedDesc = allTeamLaps.sort((a, b) => b.timestamp - a.timestamp)
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

async function applyLap(ctx: any, teamId: any, type: LapType) {
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

  // Debounce — prevent same-team double laps
  const allTeamLaps = await ctx.db
    .query('laps')
    .withIndex('by_team', (q: any) => q.eq('teamId', teamId))
    .collect()
  const sortedDesc = allTeamLaps.sort((a, b) => b.timestamp - a.timestamp)
  const lastLap = sortedDesc[0] || null
  const now = Date.now()
  if (lastLap && now - lastLap.timestamp < MIN_LAP_GAP_MS) return null

  const event = await ctx.db.get(team.eventId)
  const raceStartMs = event?.actualStart || null
  const refTs = lastLap ? lastLap.timestamp : raceStartMs
  if (!refTs) return null

  const lapTime = now - refTs
  const lapNumber = allTeamLaps.length + 1
  const currentRunnerLocalId = order.order[(team.currentIdx || 0) % order.order.length]
  const isRelay = type === 'relay_manual' || type === 'relay_auto'
  const isAuto = type === 'checkpoint_auto' || type === 'relay_auto'

  const lapId = 'lap_' + now + '_' + teamId
  await ctx.db.insert('laps', {
    teamId,
    runnerId: currentRunnerLocalId,
    id: lapId,
    lapNumber,
    timestamp: now,
    lapTime,
    type,
    autoRelay: isAuto && isRelay ? true : undefined,
  })

  if (isRelay) {
    const nextIdx = ((team.currentIdx || 0) + 1) % order.order.length
    await ctx.db.patch(teamId, { currentIdx: nextIdx, updatedAt: now })
  } else {
    await ctx.db.patch(teamId, { updatedAt: now })
  }

  return { lapId, type, lapNumber, lapTime }
}

// Delete a lap (admin / undo)
export const deleteLap = mutation({
  args: { lapId: v.id('laps') },
  handler: async (ctx, args) => {
    const lap = await ctx.db.get(args.lapId)
    if (!lap) return null
    // If it was a relay, rollback currentIdx
    if (lap.type === 'relay_manual' || lap.type === 'relay_auto') {
      const team = await ctx.db.get(lap.teamId)
      const order = await ctx.db
        .query('teamOrder')
        .withIndex('by_team', (q) => q.eq('teamId', lap.teamId))
        .first()
      if (team && order && order.order.length > 0) {
        const prevIdx = ((team.currentIdx || 0) - 1 + order.order.length) % order.order.length
        await ctx.db.patch(lap.teamId, { currentIdx: prevIdx, updatedAt: Date.now() })
      }
    }
    await ctx.db.delete(args.lapId)
    return args.lapId
  },
})
