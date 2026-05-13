import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

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

// Pause / resume cron auto-laps for a team
export const setAutoPaused = mutation({
  args: { teamId: v.id('teams'), paused: v.boolean() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.teamId, { autoPaused: args.paused, updatedAt: Date.now() })
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
      liveKmMin: v.optional(v.number()),
      liveKmSec: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('runners')
      .withIndex('by_team', (q) => q.eq('teamId', args.teamId))
      .collect()
      .then((arr) => arr.find((r) => r.id === args.runner.id))
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

// Delete runner by local string id
export const deleteRunner = mutation({
  args: { teamId: v.id('teams'), runnerLocalId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('runners')
      .withIndex('by_team', (q) => q.eq('teamId', args.teamId))
      .collect()
      .then((arr) => arr.find((r) => r.id === args.runnerLocalId))
    if (existing) await ctx.db.delete(existing._id)
    return args.runnerLocalId
  },
})

// Create a new team
export const createTeam = mutation({
  args: {
    eventId: v.id('events'),
    name: v.string(),
    category: v.string(),
    color: v.string(),
    maxRunners: v.number(),
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
