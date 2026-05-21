import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { createEventWithDefaults } from './lib/eventHelpers'

// ─── Seed mutations ───────────────────────────────────────────────────────────

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
    return await createEventWithDefaults(ctx, {
      organizationId: args.organizationId,
      name: '24h de Brette-les-Pins 2026',
      slug: '24h-brette-les-pins-2026',
      scheduledStart: new Date('2026-05-16T14:00:00+02:00').getTime(),
      scheduledEnd: new Date('2026-05-17T14:00:00+02:00').getTime(),
      lapDistance: 900,
      raceDuration: 24 * 3600 * 1000,
      adminPassword: 'azerty2026',
      superAdminPin: '080687',
    })
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
// 9 runners in relay order — Simon(6) → Martial(5) → Charlotte(4) → Baptiste(6) →
// Marina(4) → Marc(5) → Théo(6) → Lucie(4) → Pascal(6) = 46 laps per rotation.
// Pace prédiction (kmMin/Sec) + 1er relai observé (theoreticalRelayPaceMin/Sec)
// fournis depuis le tableau papier de l'équipe.
// Event is configured in testMode so the mock Chronoplace API serves laps compressed.
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

    const eventId = await createEventWithDefaults(ctx, {
      organizationId: orgId,
      name: '24h Running 2026 (mock)',
      slug,
      scheduledStart: new Date('2026-05-16T14:00:00+02:00').getTime(),
      scheduledEnd: new Date('2026-05-17T14:00:00+02:00').getTime(),
      lapDistance: 900,
      raceDuration: 24 * 3600 * 1000,
      adminPassword: 'azerty2026',
      superAdminPin: '080687',
    })
    await ctx.db.patch(eventId, {
      chronoplaceEventId: 225,
      testMode: true,
      relayTransitionSec: 5,
      lateGraceSec: 45,
      cityName: 'Brette-les-Pins',
      latitude: 47.9133,
      longitude: 0.33765,
      firstLapDistanceM: 800,
      chronoplaceClassementUrl: 'https://www.chronoplace.fr/classement/24h-running-2026/epreuve/552',
      organizerUrl: 'https://fr.milesrepublic.com/event/24h-running-15149',
      updatedAt: Date.now(),
    })

    // Order + pace prédiction (col "Prédiction temps" papier) +
    // 1er relai observé dérivé directement du mock Chronoplace (MOCK_HEROES_ACADEMY_LAPS)
    // = source de vérité. Formule: sum(indices) / (nbLaps * 0.9km).
    // Rotation 1 (53 tours) = Simon[0..5](6) Martial[6..10](5) Charlotte[11..14](4)
    // Baptiste[15..20](6) Marina[21..24](4) Marc[25..29](5) Théo[30..35](6)
    // Lucie[36..39](4) Pascal[40..52](13).
    // Pascal remplace un coureur absent → plannedLaps = 2×6 = 12 (théorique).
    // Rotation 1 observée a 13 tours (1 de plus que théorique), rotation 2 = 12 (théorique).
    const runnersTemplate: Array<{
      name: string
      kmMin: number
      kmSec: number
      plannedLaps: number
      color: string
      theoreticalRelayPaceMin?: number
      theoreticalRelayPaceSec?: number
    }> = [
      // Simon — pace 5'00, 6 tours, 1er relai 1510s → 4'40/km
      { name: 'Simon',     kmMin: 5, kmSec: 0,  plannedLaps: 6, color: '#A6F060', theoreticalRelayPaceMin: 4, theoreticalRelayPaceSec: 40 },
      // Martial — pace 5'30, 5 tours, 1er relai 1315s → 4'52/km
      { name: 'Martial',   kmMin: 5, kmSec: 30, plannedLaps: 5, color: '#60D9F0', theoreticalRelayPaceMin: 4, theoreticalRelayPaceSec: 52 },
      // Charlotte — pace 6'15, 4 tours, 1er relai 1357s → 6'17/km
      { name: 'Charlotte', kmMin: 6, kmSec: 15, plannedLaps: 4, color: '#F06080', theoreticalRelayPaceMin: 6, theoreticalRelayPaceSec: 17 },
      // Baptiste — pace 4'45, 6 tours, 1er relai 1487s → 4'35/km
      { name: 'Baptiste',  kmMin: 4, kmSec: 45, plannedLaps: 6, color: '#F0A860', theoreticalRelayPaceMin: 4, theoreticalRelayPaceSec: 35 },
      // Marina — pace 6'45, 4 tours, 1er relai 1386s → 6'25/km
      { name: 'Marina',    kmMin: 6, kmSec: 45, plannedLaps: 4, color: '#D060F0', theoreticalRelayPaceMin: 6, theoreticalRelayPaceSec: 25 },
      // Marc — pace 5'30, 5 tours, 1er relai 1509s → 5'35/km
      { name: 'Marc',      kmMin: 5, kmSec: 30, plannedLaps: 5, color: '#F0E060', theoreticalRelayPaceMin: 5, theoreticalRelayPaceSec: 35 },
      // Théo — pace 5'00, 6 tours, 1er relai 1651s → 5'06/km
      { name: 'Théo',      kmMin: 5, kmSec: 0,  plannedLaps: 6, color: '#60F0C0', theoreticalRelayPaceMin: 5, theoreticalRelayPaceSec: 6 },
      // Lucie — pace 6'00, 4 tours, 1er relai 1219s → 5'39/km
      { name: 'Lucie',     kmMin: 6, kmSec: 0,  plannedLaps: 4, color: '#F060C0', theoreticalRelayPaceMin: 5, theoreticalRelayPaceSec: 39 },
      // Pascal — pace 4'20, 12 tours (remplace un absent, 2×6 théorique),
      // 1er relai observé 13 tours en 2993s → 4'16/km
      { name: 'Pascal',    kmMin: 4, kmSec: 20, plannedLaps: 12, color: '#6080F0', theoreticalRelayPaceMin: 4, theoreticalRelayPaceSec: 16 },
    ]

    const teamId = await ctx.db.insert('teams', {
      eventId,
      name: 'Heroes Academy',
      category: 'Mixte',
      color: '#60D9F0',
      maxRunners: 9,
      goalLaps: 300,
      pin: '0000',
      ready: true,
      currentIdx: 0,
      chronoplaceSlug: 'heroes-academy',
      dossard: '8',
      chronoplaceResultsUrl: 'https://www.chronoplace.fr/classement/24h-running-2026/epreuve/552/equipe/heroes-academy',
      chronoSyncEnabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    const localRunnerIds: string[] = []
    const now = Date.now()
    for (let i = 0; i < runnersTemplate.length; i++) {
      const r = runnersTemplate[i]
      const localId = `r${now}_${i}_${r.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}`
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
        theoreticalRelayPaceMin: r.theoreticalRelayPaceMin,
        theoreticalRelayPaceSec: r.theoreticalRelayPaceSec,
        createdAt: now,
      })
      localRunnerIds.push(localId)
    }

    await ctx.db.insert('teamOrder', {
      teamId,
      order: localRunnerIds,
    })

    // ── Other mock teams (Chronoplace data dispo via mockChronoplace.ts) ──
    // Aucun runner configuré → on ne connaît pas le coureur en piste, pas de planning,
    // pas d'attribution par stint. Le marker map affiche seulement nom équipe + allure
    // brute du dernier lap Chronoplace.
    type GenericTeam = {
      name: string
      color: string
      pin: string
      dossard: string
      chronoplaceSlug: string
      chronoplaceResultsUrl: string
    }
    const otherTeams: GenericTeam[] = [
      {
        name: "Les Licornes ça n'existe pas",
        color: '#F060A0',
        pin: '0001',
        dossard: '26',
        chronoplaceSlug: "les-licornes-ca-n'existe-pas",
        chronoplaceResultsUrl: "https://www.chronoplace.fr/classement/24h-running-2026/epreuve/552/equipe/les-licornes-ca-n'existe-pas",
      },
      {
        name: 'F2tards Endurants',
        color: '#F0C040',
        pin: '0002',
        dossard: '7',
        chronoplaceSlug: 'f2tards-endurants',
        chronoplaceResultsUrl: 'https://www.chronoplace.fr/classement/24h-running-2026/epreuve/552/equipe/f2tards-endurants',
      },
      {
        name: 'Aiglehoux et compagnie',
        color: '#80C0F0',
        pin: '0003',
        dossard: '5',
        chronoplaceSlug: 'aiglehoux-et-compagnie',
        chronoplaceResultsUrl: 'https://www.chronoplace.fr/classement/24h-running-2026/epreuve/552/equipe/aiglehoux-et-compagnie',
      },
    ]

    const otherTeamIds: any[] = []
    for (const ot of otherTeams) {
      const otId = await ctx.db.insert('teams', {
        eventId,
        name: ot.name,
        category: 'Mixte',
        color: ot.color,
        maxRunners: 0,
        goalLaps: 280,
        pin: ot.pin,
        ready: true,
        currentIdx: 0,
        chronoplaceSlug: ot.chronoplaceSlug,
        dossard: ot.dossard,
        chronoplaceResultsUrl: ot.chronoplaceResultsUrl,
        chronoSyncEnabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      // Pas de runners, pas de teamOrder.
      otherTeamIds.push(otId)
    }

    return {
      skipped: false,
      orgId,
      eventId,
      teamIds: [teamId, ...otherTeamIds],
      totalRunners: runnersTemplate.length,
    }
  },
})

// Seed isolated demo event (idempotent). Same team structure (same chronoplaceSlugs
// so mock Chronoplace data resolves) but a distinct slug + organization so it never
// touches real archived events. Demo routes (/demo, /demo/admin, /demo/team/$teamId)
// consume this event.
export const seedDemoEvent = mutation({
  args: {},
  handler: async (ctx) => {
    const slug = 'demo-mock-event'
    const existing = await ctx.db
      .query('events')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .first()
    if (existing) {
      return { skipped: true, eventId: existing._id, reason: 'already seeded' }
    }

    const orgId = await ctx.db.insert('organizations', {
      name: 'Demo Sandbox',
      slug: 'demo-sandbox',
      createdAt: Date.now(),
    })

    const eventId = await createEventWithDefaults(ctx, {
      organizationId: orgId,
      name: 'Démo · Course 24h mock',
      slug,
      scheduledStart: new Date('2026-05-16T14:00:00+02:00').getTime(),
      scheduledEnd: new Date('2026-05-17T14:00:00+02:00').getTime(),
      lapDistance: 900,
      raceDuration: 24 * 3600 * 1000,
      adminPassword: 'demo',
      superAdminPin: '000000',
    })
    await ctx.db.patch(eventId, {
      testMode: true,
      relayTransitionSec: 5,
      lateGraceSec: 45,
      cityName: 'Brette-les-Pins',
      latitude: 47.9133,
      longitude: 0.33765,
      firstLapDistanceM: 800,
      updatedAt: Date.now(),
    })

    // Heroes Academy (configured team with runners + order)
    const runnersTemplate: Array<{
      name: string
      kmMin: number
      kmSec: number
      plannedLaps: number
      color: string
      theoreticalRelayPaceMin?: number
      theoreticalRelayPaceSec?: number
    }> = [
      { name: 'Simon',     kmMin: 5, kmSec: 0,  plannedLaps: 6, color: '#A6F060', theoreticalRelayPaceMin: 4, theoreticalRelayPaceSec: 40 },
      { name: 'Martial',   kmMin: 5, kmSec: 30, plannedLaps: 5, color: '#60D9F0', theoreticalRelayPaceMin: 4, theoreticalRelayPaceSec: 52 },
      { name: 'Charlotte', kmMin: 6, kmSec: 15, plannedLaps: 4, color: '#F06080', theoreticalRelayPaceMin: 6, theoreticalRelayPaceSec: 17 },
      { name: 'Baptiste',  kmMin: 4, kmSec: 45, plannedLaps: 6, color: '#F0A860', theoreticalRelayPaceMin: 4, theoreticalRelayPaceSec: 35 },
      { name: 'Marina',    kmMin: 6, kmSec: 45, plannedLaps: 4, color: '#D060F0', theoreticalRelayPaceMin: 6, theoreticalRelayPaceSec: 25 },
      { name: 'Marc',      kmMin: 5, kmSec: 30, plannedLaps: 5, color: '#F0E060', theoreticalRelayPaceMin: 5, theoreticalRelayPaceSec: 35 },
      { name: 'Théo',      kmMin: 5, kmSec: 0,  plannedLaps: 6, color: '#60F0C0', theoreticalRelayPaceMin: 5, theoreticalRelayPaceSec: 6 },
      { name: 'Lucie',     kmMin: 6, kmSec: 0,  plannedLaps: 4, color: '#F060C0', theoreticalRelayPaceMin: 5, theoreticalRelayPaceSec: 39 },
      { name: 'Pascal',    kmMin: 4, kmSec: 20, plannedLaps: 12, color: '#6080F0', theoreticalRelayPaceMin: 4, theoreticalRelayPaceSec: 16 },
    ]

    const teamId = await ctx.db.insert('teams', {
      eventId,
      name: 'Heroes Academy',
      category: 'Mixte',
      color: '#60D9F0',
      maxRunners: 9,
      goalLaps: 300,
      pin: '0000',
      ready: true,
      currentIdx: 0,
      chronoplaceSlug: 'heroes-academy',
      dossard: '8',
      chronoSyncEnabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    const localRunnerIds: string[] = []
    const now = Date.now()
    for (let i = 0; i < runnersTemplate.length; i++) {
      const r = runnersTemplate[i]
      const localId = `r${now}_${i}_${r.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}`
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
        theoreticalRelayPaceMin: r.theoreticalRelayPaceMin,
        theoreticalRelayPaceSec: r.theoreticalRelayPaceSec,
        createdAt: now,
      })
      localRunnerIds.push(localId)
    }
    await ctx.db.insert('teamOrder', { teamId, order: localRunnerIds })

    // Other mock teams (no runners, mock laps via chronoplace mock)
    const otherTeams = [
      { name: "Les Licornes ça n'existe pas", color: '#F060A0', pin: '0001', dossard: '26', chronoplaceSlug: "les-licornes-ca-n'existe-pas" },
      { name: 'F2tards Endurants', color: '#F0C040', pin: '0002', dossard: '7', chronoplaceSlug: 'f2tards-endurants' },
      { name: 'Aiglehoux et compagnie', color: '#80C0F0', pin: '0003', dossard: '5', chronoplaceSlug: 'aiglehoux-et-compagnie' },
    ]
    const otherTeamIds: any[] = []
    for (const ot of otherTeams) {
      const otId = await ctx.db.insert('teams', {
        eventId,
        name: ot.name,
        category: 'Mixte',
        color: ot.color,
        maxRunners: 0,
        goalLaps: 280,
        pin: ot.pin,
        ready: true,
        currentIdx: 0,
        chronoplaceSlug: ot.chronoplaceSlug,
        dossard: ot.dossard,
        chronoSyncEnabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      otherTeamIds.push(otId)
    }

    return { skipped: false, orgId, eventId, teamIds: [teamId, ...otherTeamIds] }
  },
})