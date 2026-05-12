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

    return { ...team, runners }
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
