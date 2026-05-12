import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

// List all events
export const list = query({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db.query('events').collect()
    return events
  },
})

// Get event by slug
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query('events')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .first()
    return event
  },
})

// Get event by id
export const getById = query({
  args: { eventId: v.id('events') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.eventId)
  },
})

// Resolve any string id: returns { kind: 'event' | 'team' | 'unknown', event?, team? }
// Used to recover from legacy URLs that stored a teamId where an eventId is expected.
export const resolveId = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const eventId = ctx.db.normalizeId('events', args.id)
    if (eventId) {
      const event = await ctx.db.get(eventId)
      if (event) return { kind: 'event' as const, event, team: null }
    }
    const teamId = ctx.db.normalizeId('teams', args.id)
    if (teamId) {
      const team = await ctx.db.get(teamId)
      if (team) {
        const event = await ctx.db.get(team.eventId)
        return { kind: 'team' as const, event, team }
      }
    }
    return { kind: 'unknown' as const, event: null, team: null }
  },
})

// ─── Race control mutations ────────────────────────────────────────────────

export const startRaceNow = mutation({
  args: { eventId: v.id('events') },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.eventId, {
      status: 'running',
      actualStart: Date.now(),
      updatedAt: Date.now(),
    })
  },
})

export const startRaceAtScheduled = mutation({
  args: { eventId: v.id('events') },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId)
    if (!event?.scheduledStart) return
    await ctx.db.patch(args.eventId, {
      status: 'running',
      actualStart: event.scheduledStart,
      updatedAt: Date.now(),
    })
  },
})

export const stopRace = mutation({
  args: { eventId: v.id('events') },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.eventId, {
      status: 'paused',
      updatedAt: Date.now(),
    })
  },
})

export const correctActualStart = mutation({
  args: { eventId: v.id('events'), actualStart: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.eventId, {
      actualStart: args.actualStart,
      updatedAt: Date.now(),
    })
  },
})

export const resetRace = mutation({
  args: { eventId: v.id('events') },
  handler: async (ctx, args) => {
    // Reset event
    await ctx.db.patch(args.eventId, {
      status: 'scheduled',
      actualStart: undefined,
      updatedAt: Date.now(),
    })
    // Delete all laps for teams of this event
    const teams = await ctx.db
      .query('teams')
      .withIndex('by_event', (q) => q.eq('eventId', args.eventId))
      .collect()
    for (const team of teams) {
      const laps = await ctx.db
        .query('laps')
        .withIndex('by_team', (q) => q.eq('teamId', team._id))
        .collect()
      for (const lap of laps) await ctx.db.delete(lap._id)
      await ctx.db.patch(team._id, { currentIdx: 0, ready: false, updatedAt: Date.now() })
    }
    // Delete all interruptions for this event
    const interruptions = await ctx.db
      .query('interruptions')
      .withIndex('by_event', (q) => q.eq('eventId', args.eventId))
      .collect()
    for (const it of interruptions) await ctx.db.delete(it._id)
  },
})

export const setSchedule = mutation({
  args: {
    eventId: v.id('events'),
    scheduledStart: v.optional(v.number()),
    scheduledEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, any> = { updatedAt: Date.now() }
    if (args.scheduledStart !== undefined) patch.scheduledStart = args.scheduledStart
    if (args.scheduledEnd !== undefined) patch.scheduledEnd = args.scheduledEnd
    await ctx.db.patch(args.eventId, patch)
  },
})

export const updateContact = mutation({
  args: {
    eventId: v.id('events'),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.eventId, {
      contact: { email: args.email, phone: args.phone },
      updatedAt: Date.now(),
    })
  },
})

export const updateAdminPassword = mutation({
  args: { eventId: v.id('events'), password: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.eventId, { adminPassword: args.password, updatedAt: Date.now() })
  },
})

// ─── Interruptions ─────────────────────────────────────────────────────────

export const startInterruption = mutation({
  args: {
    eventId: v.id('events'),
    kind: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert('interruptions', {
      eventId: args.eventId,
      kind: args.kind,
      reason: args.reason,
      startMs: Date.now(),
    })
    if (args.kind === 'race') {
      await ctx.db.patch(args.eventId, { status: 'paused', updatedAt: Date.now() })
    }
    return id
  },
})

export const endInterruption = mutation({
  args: { interruptionId: v.id('interruptions') },
  handler: async (ctx, args) => {
    const itr = await ctx.db.get(args.interruptionId)
    if (!itr) return
    await ctx.db.patch(args.interruptionId, { endMs: Date.now() })
    if (itr.kind === 'race') {
      const event = await ctx.db.get(itr.eventId)
      if (event?.actualStart) {
        await ctx.db.patch(itr.eventId, { status: 'running', updatedAt: Date.now() })
      }
    }
  },
})

export const updateInterruption = mutation({
  args: {
    interruptionId: v.id('interruptions'),
    reason: v.optional(v.string()),
    startMs: v.optional(v.number()),
    endMs: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, any> = {}
    if (args.reason !== undefined) patch.reason = args.reason
    if (args.startMs !== undefined) patch.startMs = args.startMs
    if (args.endMs !== undefined) patch.endMs = args.endMs === null ? undefined : args.endMs
    await ctx.db.patch(args.interruptionId, patch)
  },
})

export const deleteInterruption = mutation({
  args: { interruptionId: v.id('interruptions') },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.interruptionId)
  },
})

export const getInterruptions = query({
  args: { eventId: v.id('events') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('interruptions')
      .withIndex('by_event', (q) => q.eq('eventId', args.eventId))
      .collect()
  },
})