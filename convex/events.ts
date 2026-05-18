import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { internal } from './_generated/api'
import { TEST_MODE_LOCK_WINDOW_MS } from './lib/timings'

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

const LAP_DISTANCE_M_FALLBACK = 900
function kmPaceToLapMsLocal(kmMin: number, kmSec: number, lapDistanceM: number): number {
  const paceSeconds = kmMin * 60 + kmSec
  const lapSeconds = (paceSeconds * lapDistanceM) / 1000
  return Math.round(lapSeconds * 1000)
}

// Snapshot theoretical cycle (#17) for each team at race start: sum(lapMs * plannedLaps)
async function snapshotTheoreticalCycles(ctx: any, eventId: any, lapDistanceM: number) {
  const teams = await ctx.db
    .query('teams')
    .withIndex('by_event', (q: any) => q.eq('eventId', eventId))
    .collect()
  for (const team of teams) {
    const runners = await ctx.db
      .query('runners')
      .withIndex('by_team', (q: any) => q.eq('teamId', team._id))
      .collect()
    const cycleMs = runners
      .filter((r: any) => r.status !== 'out')
      .reduce(
        (sum: number, r: any) =>
          sum + kmPaceToLapMsLocal(r.kmMin || 0, r.kmSec || 0, lapDistanceM) * (r.plannedLaps || 1),
        0,
      )
    await ctx.db.patch(team._id, { theoreticalCycleMs: cycleMs, updatedAt: Date.now() })
  }
}

export const startRaceNow = mutation({
  args: { eventId: v.id('events') },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId)
    const lapDistanceM = (event as any)?.lapDistance || LAP_DISTANCE_M_FALLBACK
    await ctx.db.patch(args.eventId, {
      status: 'running',
      actualStart: Date.now(),
      updatedAt: Date.now(),
    })
    await snapshotTheoreticalCycles(ctx, args.eventId, lapDistanceM)
    await bootstrapChronoBurstsForEvent(ctx, args.eventId)
  },
})

export const startRaceAtScheduled = mutation({
  args: { eventId: v.id('events') },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId)
    if (!event?.scheduledStart) return
    const lapDistanceM = (event as any)?.lapDistance || LAP_DISTANCE_M_FALLBACK
    await ctx.db.patch(args.eventId, {
      status: 'running',
      actualStart: event.scheduledStart,
      updatedAt: Date.now(),
    })
    await snapshotTheoreticalCycles(ctx, args.eventId, lapDistanceM)
    await bootstrapChronoBurstsForEvent(ctx, args.eventId)
  },
})

// Fan out the first auto-burst for every Chronoplace-enabled team of an event. Called
// from race start so the polling chain begins immediately.
async function bootstrapChronoBurstsForEvent(ctx: any, eventId: any) {
  const teams = await ctx.db
    .query('teams')
    .withIndex('by_event', (q: any) => q.eq('eventId', eventId))
    .collect()
  for (const t of teams) {
    if (!t.chronoSyncEnabled || !t.chronoplaceSlug) continue
    await ctx.scheduler.runAfter(0, internal.chronoplace.scheduleNextAutoBurst, {
      teamId: t._id,
    })
  }
}

export const stopRace = mutation({
  args: { eventId: v.id('events') },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.eventId, {
      status: 'paused',
      updatedAt: Date.now(),
    })
  },
})

// Permanently end the event (admin "Arrêter l'événement"). Sets actualEnd + status='finished'.
// Per CTO #13: NO cascade on teams — captains must still record finish per team
// (sportive rule: tour entamé compte). Idempotent.
export const endRace = mutation({
  args: { eventId: v.id('events') },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId)
    if (!event) throw new ConvexError({ code: 'EVENT_NOT_FOUND', message: 'Événement introuvable.' })
    if ((event as any).actualEnd) return (event as any).actualEnd // idempotent
    const actualEnd = Date.now()
    await ctx.db.patch(args.eventId, {
      status: 'finished',
      actualEnd,
      updatedAt: actualEnd,
    })
    return actualEnd
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
    // Reset event — clear actualStart + actualEnd + back to 'scheduled'
    await ctx.db.patch(args.eventId, {
      status: 'scheduled',
      actualStart: undefined,
      actualEnd: undefined,
      updatedAt: Date.now(),
    })
    // Delete all laps for teams + clear team race state (currentIdx, ready, finished, autoPaused, cooldown, group queue)
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
      await ctx.db.patch(team._id, {
        currentIdx: 0,
        ready: false,
        finishedAt: undefined,
        finishedByLap: undefined,
        autoPaused: undefined,
        cronCooldownUntil: undefined,
        groupModeQueue: undefined,
        theoreticalCycleMs: undefined,
        updatedAt: Date.now(),
      })
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

export const updateReplaceAutoWindow = mutation({
  args: { eventId: v.id('events'), seconds: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.eventId, {
      replaceAutoWindowSec: Math.max(0, Math.round(args.seconds)),
      updatedAt: Date.now(),
    })
  },
})

// Default value when event has no explicit setting.
export const DEFAULT_MAX_RUNNERS_PER_TEAM = 10
export const DEFAULT_RELAY_TRANSITION_SEC = 5

// Toggle test mode (fast timings for cron/auto-pass dev). Locked once race started
// or scheduled start within TEST_MODE_LOCK_WINDOW_MS (10 min).
export const setTestMode = mutation({
  args: { eventId: v.id('events'), value: v.boolean() },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId)
    if (!event) throw new ConvexError({ code: 'EVENT_NOT_FOUND', message: 'Événement introuvable.' })
    if (event.status !== 'scheduled') {
      throw new ConvexError({
        code: 'TEST_MODE_LOCKED_RACE_STARTED',
        message: 'Mode test verrouillé : la course est déjà démarrée ou terminée.',
      })
    }
    if (event.scheduledStart && event.scheduledStart - Date.now() < TEST_MODE_LOCK_WINDOW_MS) {
      throw new ConvexError({
        code: 'TEST_MODE_LOCKED_NEAR_START',
        message: 'Mode test verrouillé : la course démarre dans moins de 10 minutes.',
      })
    }
    await ctx.db.patch(args.eventId, { testMode: args.value, updatedAt: Date.now() })
    return args.value
  },
})

// Set the relay transition penalty in seconds (used for delta calculations + future auto-pass).
export const setRelayTransitionSec = mutation({
  args: { eventId: v.id('events'), seconds: v.number() },
  handler: async (ctx, args) => {
    const seconds = Math.round(args.seconds)
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 60) {
      throw new ConvexError({
        code: 'INVALID_RELAY_TRANSITION',
        message: 'Le temps de transition relai doit être entre 0 et 60 secondes.',
      })
    }
    await ctx.db.patch(args.eventId, { relayTransitionSec: seconds, updatedAt: Date.now() })
    return seconds
  },
})

// Set the late-grace window in seconds (cron waits this delay after expectedLapMs
// before firing an auto-pass; lets the team record a real late manual first).
// 0 = legacy behavior (auto fires the instant the expected end is reached).
export const setLateGraceSec = mutation({
  args: { eventId: v.id('events'), seconds: v.number() },
  handler: async (ctx, args) => {
    const seconds = Math.round(args.seconds)
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 300) {
      throw new ConvexError({
        code: 'INVALID_LATE_GRACE',
        message: 'La grâce retard doit être entre 0 et 300 secondes.',
      })
    }
    await ctx.db.patch(args.eventId, { lateGraceSec: seconds, updatedAt: Date.now() })
    return seconds
  },
})

// Set the Chronoplace event id (number) used to build the JSON API URL.
// Pass 0 or null to clear the value (disables chronoplace sync for all teams of this event).
export const setChronoplaceEventId = mutation({
  args: { eventId: v.id('events'), chronoplaceEventId: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const cpId = args.chronoplaceEventId
    if (cpId !== undefined && (!Number.isFinite(cpId) || cpId < 0)) {
      throw new ConvexError({
        code: 'INVALID_CHRONOPLACE_EVENT_ID',
        message: "L'ID d'événement Chronoplace doit être un entier positif.",
      })
    }
    await ctx.db.patch(args.eventId, {
      chronoplaceEventId: cpId && cpId > 0 ? Math.round(cpId) : undefined,
      updatedAt: Date.now(),
    } as any)
    return cpId
  },
})

// Set max runners per team at event level. Refuses if any team would exceed.
export const setMaxRunnersPerTeam = mutation({
  args: { eventId: v.id('events'), value: v.number() },
  handler: async (ctx, args) => {
    const value = Math.max(1, Math.min(50, Math.round(args.value)))
    const teams = await ctx.db
      .query('teams')
      .withIndex('by_event', (q) => q.eq('eventId', args.eventId))
      .collect()
    for (const team of teams) {
      const runners = await ctx.db
        .query('runners')
        .withIndex('by_team', (q) => q.eq('teamId', team._id))
        .collect()
      const active = runners.filter((r: any) => r.status !== 'out').length
      if (active > value) {
        throw new ConvexError({
          code: 'TEAM_CAPACITY_EXCEEDED',
          teamName: team.name,
          activeCount: active,
          requested: value,
          message: `Équipe "${team.name}" a ${active} coureurs actifs — réduire d'abord avant de baisser à ${value}.`,
        })
      }
    }
    await ctx.db.patch(args.eventId, { maxRunnersPerTeam: value, updatedAt: Date.now() })
    return value
  },
})

// Set event geolocation (lat/lng + city display name) for weather forecast.
// Validation: lat -90..90, lng -180..180. ConvexError on invalid input.
export const setLatLng = mutation({
  args: {
    eventId: v.id('events'),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    cityName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.latitude !== undefined && (args.latitude < -90 || args.latitude > 90)) {
      throw new ConvexError({ code: 'INVALID_LATITUDE', message: 'Latitude doit être entre -90 et 90.' })
    }
    if (args.longitude !== undefined && (args.longitude < -180 || args.longitude > 180)) {
      throw new ConvexError({ code: 'INVALID_LONGITUDE', message: 'Longitude doit être entre -180 et 180.' })
    }
    const patch: Record<string, any> = { updatedAt: Date.now() }
    if (args.latitude !== undefined) patch.latitude = args.latitude
    if (args.longitude !== undefined) patch.longitude = args.longitude
    if (args.cityName !== undefined) patch.cityName = args.cityName.trim().slice(0, 60) || undefined
    await ctx.db.patch(args.eventId, patch)
  },
})

export const setFirstLapDistance = mutation({
  args: { eventId: v.id('events'), meters: v.number() },
  handler: async (ctx, args) => {
    const m = Math.max(0, Math.round(args.meters))
    await ctx.db.patch(args.eventId, {
      firstLapDistanceM: m > 0 ? m : undefined,
      updatedAt: Date.now(),
    } as any)
  },
})

export const setTestModeDivider = mutation({
  args: { eventId: v.id('events'), divider: v.number() },
  handler: async (ctx, args) => {
    const d = Math.max(1, Math.round(args.divider))
    await ctx.db.patch(args.eventId, {
      testModeDivider: d,
      updatedAt: Date.now(),
    } as any)
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