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

// All-in-one seed (idempotent: skips if event slug already exists)
export const seedAll = mutation({
  args: {},
  handler: async (ctx) => {
    const slug = '24h-brette-les-pins-2026'
    const existing = await ctx.db
      .query('events')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .first()
    if (existing) {
      console.log('[seedAll] skipped — event already exists', existing._id)
      return { skipped: true, eventId: existing._id, reason: 'already seeded' }
    }

    const orgId = await ctx.db.insert('organizations', {
      name: 'Demo Organization',
      slug: 'demo-organization',
      createdAt: Date.now(),
    })

    const eventId = await ctx.db.insert('events', {
      organizationId: orgId,
      name: '24h de Brette-les-Pins 2026',
      slug,
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

    const runnersTemplate = [
      { name: 'Lulu', kmMin: 6, kmSec: 0 },
      { name: 'Pascal', kmMin: 4, kmSec: 15 },
      { name: 'Baco', kmMin: 4, kmSec: 45 },
      { name: 'Klempic', kmMin: 5, kmSec: 30 },
      { name: 'Charlotte', kmMin: 6, kmSec: 0 },
      { name: 'Toto', kmMin: 4, kmSec: 45 },
    ]
    const runnerPalette = ['#A6F060', '#60D9F0', '#F0A860', '#D060F0', '#F06080', '#F0E060', '#80F0C8', '#F08060']

    const teams: Array<{ name: string; color: string }> = [
      { name: 'Équipe Alpha', color: '#A6F060' },
      { name: 'Équipe Beta', color: '#60D9F0' },
    ]

    let totalRunners = 0
    const teamIds: string[] = []
    for (const t of teams) {
      const teamId = await ctx.db.insert('teams', {
        eventId,
        name: t.name,
        category: 'Mixte',
        color: t.color,
        maxRunners: 6,
        goalLaps: 200,
        pin: '0000',
        ready: false,
        currentIdx: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      teamIds.push(teamId)

      const localRunnerIds: string[] = []
      for (let i = 0; i < runnersTemplate.length; i++) {
        const r = runnersTemplate[i]
        const localId = `r${Date.now()}_${i}_${r.name.toLowerCase()}`
        await ctx.db.insert('runners', {
          teamId,
          name: r.name,
          id: localId,
          kmMin: r.kmMin,
          kmSec: r.kmSec,
          energy: 100,
          plannedLaps: 4,
          color: runnerPalette[i % runnerPalette.length],
          status: 'ready',
          createdAt: Date.now(),
        })
        localRunnerIds.push(localId)
        totalRunners++
      }

      await ctx.db.insert('teamOrder', {
        teamId,
        order: localRunnerIds,
      })
    }

    return {
      skipped: false,
      orgId,
      eventId,
      teamIds,
      totalRunners,
    }
  },
})