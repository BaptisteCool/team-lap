import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { internal } from './_generated/api'

export const DEFAULT_MAX_RUNNERS_PER_TEAM = 10

// Helper (used internally): resolve max runners via the event parent.
async function resolveMaxRunners(ctx: any, teamId: any): Promise<number> {
  const team = await ctx.db.get(teamId)
  if (!team) return DEFAULT_MAX_RUNNERS_PER_TEAM
  const event = await ctx.db.get(team.eventId)
  return event?.maxRunnersPerTeam ?? DEFAULT_MAX_RUNNERS_PER_TEAM
}

// Helper (used internally): is the race started? (status anything other than 'scheduled')
async function raceStarted(ctx: any, teamId: any): Promise<boolean> {
  const team = await ctx.db.get(teamId)
  if (!team) return false
  const event = await ctx.db.get(team.eventId)
  return !!event && event.status !== 'scheduled'
}

// Get all teams for an event
export const getTeams = query({
  args: { eventId: v.id('events') },
  handler: async (ctx, args) => {
    const teams = await ctx.db
      .query('teams')
      .withIndex('by_event', (q) => q.eq('eventId', args.eventId))
      .collect()
    return teams
  },
})

// Get all teams + their runners + order (used by HomeScreen for live marker progress + card details)
export const getTeamsFull = query({
  args: { eventId: v.id('events') },
  handler: async (ctx, args) => {
    const teams = await ctx.db
      .query('teams')
      .withIndex('by_event', (q) => q.eq('eventId', args.eventId))
      .collect()
    const result = []
    for (const team of teams) {
      const runners = await ctx.db
        .query('runners')
        .withIndex('by_team', (q) => q.eq('teamId', team._id))
        .collect()
      const orderDoc = await ctx.db
        .query('teamOrder')
        .withIndex('by_team', (q) => q.eq('teamId', team._id))
        .first()
      result.push({ ...team, runners, order: orderDoc?.order || [] })
    }
    return result
  },
})

// Get a single team with runners
export const getTeam = query({
  args: { teamId: v.id('teams') },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId)
    if (!team) return null

    const runners = await ctx.db
      .query('runners')
      .withIndex('by_team', (q) => q.eq('teamId', args.teamId))
      .collect()

    const teamOrder = await ctx.db
      .query('teamOrder')
      .withIndex('by_team', (q) => q.eq('teamId', args.teamId))
      .first()

    return { ...team, runners, order: teamOrder?.order || [] }
  },
})

// Mark this team as finished (manual click by captain after scheduledEnd).
// Idempotent + guards: refused before scheduledEnd; refused if event missing.
export const recordFinish = mutation({
  args: { teamId: v.id('teams') },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId)
    if (!team) throw new ConvexError({ code: 'TEAM_NOT_FOUND', message: 'Équipe introuvable.' })
    if ((team as any).finishedAt) return (team as any).finishedAt // idempotent
    const event = await ctx.db.get(team.eventId)
    if (!event?.scheduledEnd) {
      throw new ConvexError({
        code: 'NO_SCHEDULED_END',
        message: "Heure de fin non définie. L'admin doit la configurer.",
      })
    }
    if (Date.now() < event.scheduledEnd) {
      throw new ConvexError({
        code: 'RACE_NOT_OVER_YET',
        message: "L'heure de fin de course n'est pas encore atteinte.",
      })
    }
    // Snapshot lap count (real laps only — exclude type='position')
    const laps = await ctx.db
      .query('laps')
      .withIndex('by_team', (q) => q.eq('teamId', args.teamId))
      .collect()
    const finishedByLap = laps.filter((l: any) => l.type !== 'position').length
    const finishedAt = Date.now()
    await ctx.db.patch(args.teamId, { finishedAt, finishedByLap, updatedAt: finishedAt })
    return finishedAt
  },
})

// Pause / resume cron auto-laps for a team
export const setAutoPaused = mutation({
  args: { teamId: v.id('teams'), paused: v.boolean() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.teamId, { autoPaused: args.paused, updatedAt: Date.now() })
  },
})

// ─── Chronoplace sync ──────────────────────────────────────────────────────

// Set or clear the Chronoplace slug for a team. Empty string clears.
export const setChronoplaceSlug = mutation({
  args: { teamId: v.id('teams'), slug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const cleaned = (args.slug ?? '').trim()
    await ctx.db.patch(args.teamId, {
      chronoplaceSlug: cleaned.length > 0 ? cleaned : undefined,
      updatedAt: Date.now(),
    } as any)
  },
})

// Toggle Chronoplace sync for a team. When enabled, manual clicks arm a burst-poll
// of the Chronoplace API and the team's auto-pass chain takes over from server crons.
export const setChronoSyncEnabled = mutation({
  args: { teamId: v.id('teams'), enabled: v.boolean() },
  handler: async (ctx, args) => {
    const patch: Record<string, any> = {
      chronoSyncEnabled: args.enabled,
      updatedAt: Date.now(),
    }
    if (!args.enabled) {
      // Clear stale error/alert state so re-enabling later starts clean. Also clear any
      // active burst so a future enable starts fresh.
      patch.chronoSyncError = undefined
      patch.chronoAlertSentAt = undefined
      patch.pendingPollBurst = undefined
    }
    await ctx.db.patch(args.teamId, patch as any)

    // Bootstrap the auto-burst chain when enabling on a running event.
    if (args.enabled) {
      const team = await ctx.db.get(args.teamId)
      const event = team ? await ctx.db.get(team.eventId) : null
      if (event && event.status === 'running' && !(event as any).actualEnd) {
        await ctx.scheduler.runAfter(0, internal.chronoplace.scheduleNextAutoBurst, {
          teamId: args.teamId,
        })
      }
    }
  },
})

// ─── Group-relay mode ──────────────────────────────────────────────────────

async function resolveCurrentRunnerGroup(ctx: any, teamId: any) {
  const team = await ctx.db.get(teamId)
  if (!team) return { team: null, currentRunner: null }
  const order = await ctx.db
    .query('teamOrder')
    .withIndex('by_team', (q: any) => q.eq('teamId', teamId))
    .first()
  const runners = await ctx.db
    .query('runners')
    .withIndex('by_team', (q: any) => q.eq('teamId', teamId))
    .collect()
  let currentRunner: any = null
  if (order && order.order.length > 0) {
    const currentLocalId = order.order[(team.currentIdx || 0) % order.order.length]
    currentRunner = runners.find((r: any) => r.id === currentLocalId) || null
  }
  return { team, currentRunner }
}

// Set or clear a runner's group membership
export const setRunnerGroup = mutation({
  args: { teamId: v.id('teams'), runnerLocalId: v.string(), group: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const runners = await ctx.db
      .query('runners')
      .withIndex('by_team', (q) => q.eq('teamId', args.teamId))
      .collect()
    const r = runners.find((x) => x.id === args.runnerLocalId)
    if (!r) return null
    const cleaned = (args.group ?? '').trim().slice(0, 12)
    await ctx.db.patch(r._id, { group: cleaned ? cleaned : undefined })
    return r._id
  },
})

// Append a group-mode entry to the team's queue
export const enqueueGroupMode = mutation({
  args: { teamId: v.id('teams'), groupName: v.string(), remainingRelays: v.number() },
  handler: async (ctx, args) => {
    const cleanedName = args.groupName.trim().slice(0, 12)
    if (!cleanedName) return null
    const N = Math.max(1, Math.min(30, Math.round(args.remainingRelays)))
    const { team, currentRunner } = await resolveCurrentRunnerGroup(ctx, args.teamId)
    if (!team) return null
    const queue = ((team as any).groupModeQueue || []) as Array<{ groupName: string; remainingRelays: number; status: 'active' | 'pending' }>
    let newStatus: 'active' | 'pending' = 'pending'
    if (queue.length === 0) {
      newStatus = currentRunner?.group === cleanedName ? 'active' : 'pending'
    }
    const next = [...queue, { groupName: cleanedName, remainingRelays: N, status: newStatus }]
    await ctx.db.patch(args.teamId, { groupModeQueue: next, updatedAt: Date.now() })
    return next
  },
})

// Remove a queue entry by index
export const cancelGroupModeEntry = mutation({
  args: { teamId: v.id('teams'), index: v.number() },
  handler: async (ctx, args) => {
    const { team, currentRunner } = await resolveCurrentRunnerGroup(ctx, args.teamId)
    if (!team) return null
    const queue = ((team as any).groupModeQueue || []) as Array<{ groupName: string; remainingRelays: number; status: 'active' | 'pending' }>
    if (args.index < 0 || args.index >= queue.length) return null
    const next = queue.filter((_, i) => i !== args.index)
    if (args.index === 0 && next.length > 0) {
      next[0] = { ...next[0], status: currentRunner?.group === next[0].groupName ? 'active' : 'pending' }
    }
    await ctx.db.patch(args.teamId, { groupModeQueue: next.length > 0 ? next : undefined, updatedAt: Date.now() })
    return next
  },
})

// Stop the active head only (keeps pending entries)
export const stopActiveGroupMode = mutation({
  args: { teamId: v.id('teams') },
  handler: async (ctx, args) => {
    const { team, currentRunner } = await resolveCurrentRunnerGroup(ctx, args.teamId)
    if (!team) return null
    const queue = ((team as any).groupModeQueue || []) as Array<{ groupName: string; remainingRelays: number; status: 'active' | 'pending' }>
    if (queue.length === 0) return null
    const next = queue.slice(1)
    if (next.length > 0) {
      next[0] = { ...next[0], status: currentRunner?.group === next[0].groupName ? 'active' : 'pending' }
    }
    await ctx.db.patch(args.teamId, { groupModeQueue: next.length > 0 ? next : undefined, updatedAt: Date.now() })
    return next
  },
})

// Update or insert team order (relay sequence of runner local ids)
export const setTeamOrder = mutation({
  args: {
    teamId: v.id('teams'),
    order: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('teamOrder')
      .withIndex('by_team', (q) => q.eq('teamId', args.teamId))
      .first()
    if (existing) {
      await ctx.db.patch(existing._id, { order: args.order })
      return existing._id
    }
    return await ctx.db.insert('teamOrder', { teamId: args.teamId, order: args.order })
  },
})

// Upsert runner: create or update by local string id
export const upsertRunner = mutation({
  args: {
    teamId: v.id('teams'),
    runner: v.object({
      id: v.string(),
      name: v.string(),
      kmMin: v.number(),
      kmSec: v.number(),
      energy: v.number(),
      plannedLaps: v.number(),
      color: v.optional(v.string()),
      status: v.optional(v.string()),
      gender: v.optional(v.string()),
      group: v.optional(v.string()),
      liveKmMin: v.optional(v.number()),
      liveKmSec: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    const allRunners = await ctx.db
      .query('runners')
      .withIndex('by_team', (q) => q.eq('teamId', args.teamId))
      .collect()
    const existing = allRunners.find((r) => r.id === args.runner.id)
    const incomingStatus = args.runner.status ?? 'ready'
    const incomingIsActive = incomingStatus !== 'out'

    // Capacity check: only enforced when the change INCREASES the active count
    // (creation of an active runner OR existing 'out' → active transition).
    const wasActive = existing ? (existing.status ?? 'ready') !== 'out' : false
    const willConsumeSlot = incomingIsActive && !wasActive
    if (willConsumeSlot) {
      const max = await resolveMaxRunners(ctx, args.teamId)
      const activeCount = allRunners.filter((r) => (r.status ?? 'ready') !== 'out').length
      if (activeCount >= max) {
        throw new ConvexError({
          code: 'TEAM_CAPACITY_REACHED',
          activeCount,
          max,
          message: `Capacité atteinte (${activeCount}/${max} actifs). Marquez un coureur en abandon pour libérer un slot.`,
        })
      }
    }

    if (existing) {
      await ctx.db.patch(existing._id, args.runner)
      return existing._id
    }
    return await ctx.db.insert('runners', {
      teamId: args.teamId,
      ...args.runner,
      createdAt: Date.now(),
    })
  },
})

// Delete runner by local string id. Refused once the race has started — even if the runner
// hasn't taken a turn yet, his id may already be referenced by laps / currentIdx / ranking.
export const deleteRunner = mutation({
  args: { teamId: v.id('teams'), runnerLocalId: v.string() },
  handler: async (ctx, args) => {
    if (await raceStarted(ctx, args.teamId)) {
      throw new ConvexError({
        code: 'RUNNER_DELETE_FORBIDDEN_RACE_STARTED',
        message: 'Suppression impossible : la course a démarré. Marquez le coureur en abandon à la place.',
      })
    }
    const existing = await ctx.db
      .query('runners')
      .withIndex('by_team', (q) => q.eq('teamId', args.teamId))
      .collect()
      .then((arr) => arr.find((r) => r.id === args.runnerLocalId))
    if (existing) await ctx.db.delete(existing._id)
    return args.runnerLocalId
  },
})

// Create a new team. maxRunners arg is deprecated (event.maxRunnersPerTeam is source of truth)
// but accepted for backward compatibility with legacy callers.
export const createTeam = mutation({
  args: {
    eventId: v.id('events'),
    name: v.string(),
    category: v.string(),
    color: v.string(),
    maxRunners: v.optional(v.number()),
    goalLaps: v.number(),
    pin: v.string(),
  },
  handler: async (ctx, args) => {
    const teamId = await ctx.db.insert('teams', {
      eventId: args.eventId,
      name: args.name,
      category: args.category,
      color: args.color,
      maxRunners: args.maxRunners,
      goalLaps: args.goalLaps,
      pin: args.pin,
      ready: false,
      currentIdx: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    return teamId
  },
})

// Helper: resolve max runners for a team via its parent event. Fallback DEFAULT_MAX_RUNNERS_PER_TEAM (10).
export const getMaxRunnersForTeam = query({
  args: { teamId: v.id('teams') },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId)
    if (!team) return DEFAULT_MAX_RUNNERS_PER_TEAM
    const event = await ctx.db.get(team.eventId)
    return event?.maxRunnersPerTeam ?? DEFAULT_MAX_RUNNERS_PER_TEAM
  },
})

  // Update a team
  export const updateTeam = mutation({
    args: {
      teamId: v.id('teams'),
      updates: v.object({
        name: v.optional(v.string()),
        category: v.optional(v.string()),
        color: v.optional(v.string()),
        maxRunners: v.optional(v.number()),
        goalLaps: v.optional(v.number()),
        pin: v.optional(v.string()),
        ready: v.optional(v.boolean()),
        currentIdx: v.optional(v.number()),
        autoPaused: v.optional(v.boolean()),
        profileImage: v.optional(v.string()),
        contactName: v.optional(v.string()),
        contactPhone: v.optional(v.string()),
      }),
    },
    handler: async (ctx, args) => {
      const { teamId, updates } = args
      await ctx.db.patch(teamId, {
        ...updates,
        updatedAt: Date.now(),
      })
      return teamId
    },
  })

// Delete a team
export const deleteTeam = mutation({
  args: { teamId: v.id('teams') },
  handler: async (ctx, args) => {
    // Delete all runners for this team
    const runners = await ctx.db
      .query('runners')
      .withIndex('by_team', (q) => q.eq('teamId', args.teamId))
      .collect()
    
    for (const runner of runners) {
      await ctx.db.delete(runner._id)
    }
    
    // Delete team order
    const teamOrders = await ctx.db
      .query('teamOrder')
      .withIndex('by_team', (q) => q.eq('teamId', args.teamId))
      .collect()
    
    for (const order of teamOrders) {
      await ctx.db.delete(order._id)
    }
    
    // Delete the team
    await ctx.db.delete(args.teamId)
    return args.teamId
  },
})
