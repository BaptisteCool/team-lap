import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

// Start a relay that will auto-validate laps after expected duration
export const startRelay = mutation({
  args: {
    teamId: v.id('teams'),
    runnerId: v.string(),
    expectedLapMs: v.number(),
    plannedLaps: v.number(),
  },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId)
    if (!team) throw new Error('Team not found')

    // Schedule auto-validation after expected lap time
    const scheduledId = await ctx.scheduler.runAfter(
      args.expectedLapMs,
      internal.functions.autoValidateLap,
      {
        teamId: args.teamId,
        runnerId: args.runnerId,
        expectedLapMs: args.expectedLapMs,
        plannedLaps: args.plannedLaps,
      }
    )

    return { scheduledId }
  },
})

// Internal function for auto-validating laps
export const autoValidateLap = mutation({
  args: {
    teamId: v.id('teams'),
    runnerId: v.string(),
    expectedLapMs: v.number(),
    plannedLaps: v.number(),
  },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId)
    if (!team) return

    const laps = await ctx.db
      .query('laps')
      .withIndex('by_team', (q) => q.eq('teamId', args.teamId))
      .collect()

    // Count laps for current runner since last relay
    let count = 0
    for (let i = laps.length - 1; i >= 0; i--) {
      if (laps[i].type === 'relay_manual' || laps[i].type === 'relay_auto') break
      if (laps[i].runnerId === args.runnerId) count++
    }

    const lastLap = laps.length > 0 ? laps[laps.length - 1] : null
    const timestamp = lastLap ? lastLap.timestamp + args.expectedLapMs : Date.now()

    const shouldAutoRelay = count >= args.plannedLaps

    // Determine type based on whether it's a relay
    const lapType = shouldAutoRelay ? 'relay_auto' : 'checkpoint_auto'

    await ctx.db.insert('laps', {
      teamId: args.teamId,
      runnerId: args.runnerId,
      id: `lap_${timestamp}_${args.teamId}`,
      lapNumber: laps.length + 1,
      timestamp,
      lapTime: args.expectedLapMs,
      type: lapType,
      autoRelay: shouldAutoRelay,
    })

    // If auto-relay, update team's currentIdx
    if (shouldAutoRelay) {
      const teamOrder = await ctx.db
        .query('teamOrder')
        .withIndex('by_team', (q) => q.eq('teamId', args.teamId))
        .first()

      if (teamOrder) {
        const currentIdx = team.currentIdx || 0
        const nextIdx = (currentIdx + 1) % teamOrder.order.length
        await ctx.db.patch(args.teamId, { currentIdx: nextIdx })
      }
    }
  },
})

// Manual checkpoint validation
export const validateCheckpoint = mutation({
  args: {
    teamId: v.id('teams'),
    runnerId: v.string(),
    lapTime: v.number(),
  },
  handler: async (ctx, args) => {
    const laps = await ctx.db
      .query('laps')
      .withIndex('by_team', (q) => q.eq('teamId', args.teamId))
      .collect()

    const timestamp = Date.now()

    await ctx.db.insert('laps', {
      teamId: args.teamId,
      runnerId: args.runnerId,
      id: `lap_${timestamp}_${args.teamId}`,
      lapNumber: laps.length + 1,
      timestamp,
      lapTime: args.lapTime,
      type: 'checkpoint_manual',
    })
  },
})

// Manual relay validation
export const validateRelay = mutation({
  args: {
    teamId: v.id('teams'),
    runnerId: v.string(),
    lapTime: v.number(),
  },
  handler: async (ctx, args) => {
    const laps = await ctx.db
      .query('laps')
      .withIndex('by_team', (q) => q.eq('teamId', args.teamId))
      .collect()

    const timestamp = Date.now()

    await ctx.db.insert('laps', {
      teamId: args.teamId,
      runnerId: args.runnerId,
      id: `lap_${timestamp}_${args.teamId}`,
      lapNumber: laps.length + 1,
      timestamp,
      lapTime: args.lapTime,
      type: 'relay_manual',
    })

    // Update team's currentIdx
    const teamOrder = await ctx.db
      .query('teamOrder')
      .withIndex('by_team', (q) => q.eq('teamId', args.teamId))
      .first()

    if (teamOrder) {
      const team = await ctx.db.get(args.teamId)
      if (team) {
        const currentIdx = team.currentIdx || 0
        const nextIdx = (currentIdx + 1) % teamOrder.order.length
        await ctx.db.patch(args.teamId, { currentIdx: nextIdx })
      }
    }
  },
})

// Query: Get all teams for an event
export const getTeamsByEvent = query({
  args: { eventId: v.id('events') },
  handler: async (ctx, args) => {
    const teams = await ctx.db
      .query('teams')
      .withIndex('by_event', (q) => q.eq('eventId', args.eventId))
      .collect()

    return teams
  },
})

// Query: Get team by PIN
export const getTeamByPin = query({
  args: { pin: v.string() },
  handler: async (ctx, args) => {
    const team = await ctx.db
      .query('teams')
      .withIndex('by_pin', (q) => q.eq('pin', args.pin))
      .first()

    return team
  },
})

// Query: Get laps for a team
export const getLapsByTeam = query({
  args: { teamId: v.id('teams') },
  handler: async (ctx, args) => {
    const laps = await ctx.db
      .query('laps')
      .withIndex('by_team', (q) => q.eq('teamId', args.teamId))
      .collect()

    return laps
  },
})

// Query: Get runners for a team
export const getRunnersByTeam = query({
  args: { teamId: v.id('teams') },
  handler: async (ctx, args) => {
    const runners = await ctx.db
      .query('runners')
      .withIndex('by_team', (q) => q.eq('teamId', args.teamId))
      .collect()

    return runners
  },
})

// Query: Get team order
export const getTeamOrder = query({
  args: { teamId: v.id('teams') },
  handler: async (ctx, args) => {
    const teamOrder = await ctx.db
      .query('teamOrder')
      .withIndex('by_team', (q) => q.eq('teamId', args.teamId))
      .first()

    return teamOrder
  },
})

// Query: Get event by slug
export const getEventBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query('events')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .first()

    return event
  },
})

// Query: Get event status
export const getEventStatus = query({
  args: { eventId: v.id('events') },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId)
    if (!event) return null

    return {
      status: event.status,
      actualStart: event.actualStart,
      scheduledStart: event.scheduledStart,
      scheduledEnd: event.scheduledEnd,
    }
  },
})