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

// Wipes the demo event and all its data (teams, runners, order, laps, interruptions,
// rankings, weather cache). Use this before re-running `seedAll` if the schema or
// data shape changed.
export const resetSeed = mutation({
  args: {},
  handler: async (ctx) => {
    const slug = '24h-brette-les-pins-2026'
    const event = await ctx.db
      .query('events')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .first()
    if (!event) return { skipped: true, reason: 'no event' }

    const teams = await ctx.db
      .query('teams')
      .withIndex('by_event', (q) => q.eq('eventId', event._id))
      .collect()
    let deletedRunners = 0
    let deletedLaps = 0
    let deletedOrders = 0
    for (const t of teams) {
      const runners = await ctx.db
        .query('runners')
        .withIndex('by_team', (q) => q.eq('teamId', t._id))
        .collect()
      for (const r of runners) await ctx.db.delete(r._id)
      deletedRunners += runners.length
      const orders = await ctx.db
        .query('teamOrder')
        .withIndex('by_team', (q) => q.eq('teamId', t._id))
        .collect()
      for (const o of orders) await ctx.db.delete(o._id)
      deletedOrders += orders.length
      const laps = await ctx.db
        .query('laps')
        .withIndex('by_team', (q) => q.eq('teamId', t._id))
        .collect()
      for (const l of laps) await ctx.db.delete(l._id)
      deletedLaps += laps.length
      await ctx.db.delete(t._id)
    }
    const interruptions = await ctx.db
      .query('interruptions')
      .withIndex('by_event', (q) => q.eq('eventId', event._id))
      .collect()
    for (const i of interruptions) await ctx.db.delete(i._id)
    const weatherRows = await ctx.db
      .query('weather_cache')
      .withIndex('by_event', (q) => q.eq('eventId', event._id))
      .collect()
    for (const w of weatherRows) await ctx.db.delete(w._id)
    const rankings = await ctx.db
      .query('rankings')
      .withIndex('by_event', (q) => q.eq('eventId', event._id))
      .collect()
    for (const r of rankings) await ctx.db.delete(r._id)

    const orgId = event.organizationId
    await ctx.db.delete(event._id)
    // Delete the organization if no other event uses it.
    const orgEvents = await ctx.db
      .query('events')
      .withIndex('by_org', (q) => q.eq('organizationId', orgId))
      .collect()
    if (orgEvents.length === 0) await ctx.db.delete(orgId)

    return {
      deletedEvent: event._id,
      deletedTeams: teams.length,
      deletedRunners,
      deletedOrders,
      deletedLaps,
      deletedInterruptions: interruptions.length,
      deletedWeather: weatherRows.length,
      deletedRankings: rankings.length,
    }
  },
})

// All-in-one seed (idempotent: skips if event slug already exists).
// Seeds the Heroes Academy team mirrored on the real Chronoplace race (eventId 225):
// 5 runners in relay order — Sim(6) → Martial(5) → Charlotte(4) → Baco(6) → Marina(4)
// = 25 laps per rotation, matching the recorded mock data 1:1.
// Event is configured in testMode so the mock Chronoplace API serves laps compressed /4.
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
      name: 'Heroes Academy',
      slug: 'heroes-academy',
      createdAt: Date.now(),
    })

    const eventId = await ctx.db.insert('events', {
      organizationId: orgId,
      name: '24h Running 2026 (mock)',
      slug,
      scheduledStart: new Date('2026-05-16T15:00:00.000Z').getTime(),
      scheduledEnd: new Date('2026-05-17T15:00:00.000Z').getTime(),
      status: 'scheduled',
      lapDistance: 900,
      raceDuration: 24 * 3600 * 1000,
      adminPassword: 'azerty2026',
      superAdminPin: '080687',
      chronoplaceEventId: 225,
      testMode: true,
      relayTransitionSec: 5,
      lateGraceSec: 45,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    const runnersTemplate: Array<{
      name: string
      kmMin: number
      kmSec: number
      plannedLaps: number
      color: string
    }> = [
      { name: 'Sim',       kmMin: 4, kmSec: 30, plannedLaps: 6, color: '#A6F060' },
      { name: 'Martial',   kmMin: 4, kmSec: 30, plannedLaps: 5, color: '#60D9F0' },
      { name: 'Charlotte', kmMin: 6, kmSec: 0,  plannedLaps: 4, color: '#F06080' },
      { name: 'Baco',      kmMin: 6, kmSec: 30, plannedLaps: 6, color: '#F0A860' },
      { name: 'Marina',    kmMin: 6, kmSec: 45, plannedLaps: 4, color: '#D060F0' },
    ]

    const teamId = await ctx.db.insert('teams', {
      eventId,
      name: 'Heroes Academy',
      category: 'Mixte',
      color: '#60D9F0',
      maxRunners: 5,
      goalLaps: 300,
      pin: '0000',
      ready: true,
      currentIdx: 0,
      chronoplaceSlug: 'heroes-academy',
      chronoSyncEnabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    const localRunnerIds: string[] = []
    const now = Date.now()
    for (let i = 0; i < runnersTemplate.length; i++) {
      const r = runnersTemplate[i]
      const localId = `r${now}_${i}_${r.name.toLowerCase()}`
      await ctx.db.insert('runners', {
        teamId,
        name: r.name,
        id: localId,
        kmMin: r.kmMin,
        kmSec: r.kmSec,
        energy: 100,
        plannedLaps: r.plannedLaps,
        color: r.color,
        status: 'ready',
        createdAt: now,
      })
      localRunnerIds.push(localId)
    }

    await ctx.db.insert('teamOrder', {
      teamId,
      order: localRunnerIds,
    })

    return {
      skipped: false,
      orgId,
      eventId,
      teamIds: [teamId],
      totalRunners: runnersTemplate.length,
    }
  },
})