import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

// Create a demo organization
export const createDemoOrganization = mutation({
  args: {},
  handler: async (ctx) => {
    const orgId = await ctx.db.insert('organizations', {
      name: 'Demo Organization',
      slug: 'demo-organization',
      createdAt: Date.now(),
    })
    return orgId
  },
})

// Create a demo event
export const createDemoEvent = mutation({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, args) => {
    const eventId = await ctx.db.insert('events', {
      organizationId: args.organizationId,
      name: '24h de Brette-les-Pins 2026',
      slug: '24h-brette-les-pins-2026',
      scheduledStart: new Date('2026-05-16T15:00:00.000Z').getTime(),
      scheduledEnd: new Date('2026-05-17T15:00:00.000Z').getTime(),
      status: 'scheduled',
      lapDistance: 900,
      raceDuration: 24 * 3600 * 1000,
      adminPassword: 'azerty2026',
      superAdminPin: '080687',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    return eventId
  },
})

// Create a demo team
export const createDemoTeam = mutation({
  args: { 
    eventId: v.id('events'),
    name: v.string(),
    color: v.string(),
  },
  handler: async (ctx, args) => {
    const teamId = await ctx.db.insert('teams', {
      eventId: args.eventId,
      name: args.name,
      category: 'Mixte',
      color: args.color,
      maxRunners: 6,
      goalLaps: 200,
      pin: '0000',
      ready: false,
      currentIdx: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    return teamId
  },
})

// Create demo runners
export const createDemoRunners = mutation({
  args: { teamId: v.id('teams') },
  handler: async (ctx, args) => {
    const runners = [
      { name: 'Lulu', kmMin: 6, kmSec: 0, color: '#A6F060' },
      { name: 'Pascal', kmMin: 4, kmSec: 15, color: '#60D9F0' },
      { name: 'Baco', kmMin: 4, kmSec: 45, color: '#F0A860' },
      { name: 'Klempic', kmMin: 5, kmSec: 30, color: '#D060F0' },
      { name: 'Charlotte', kmMin: 6, kmSec: 0, color: '#F06080' },
      { name: 'Toto', kmMin: 4, kmSec: 45, color: '#F0E060' },
    ]

    const runnerIds = []
    for (const runner of runners) {
      const id = await ctx.db.insert('runners', {
        teamId: args.teamId,
        name: runner.name,
        id: `r${Date.now()}_${runner.name.toLowerCase().replace(/\s/g, '')}`,
        kmMin: runner.kmMin,
        kmSec: runner.kmSec,
        energy: 100,
        plannedLaps: 4,
        createdAt: Date.now(),
      })
      runnerIds.push(id)
    }
    return runnerIds
  },
})

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