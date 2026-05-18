import { v } from 'convex/values'
import { internalMutation, internalQuery, mutation } from './_generated/server'
import { internal } from './_generated/api'

// A heartbeat is fresh for this many milliseconds. Clients beat every 30s so 60s gives
// one full beat of margin for clock skew / slow network.
export const PRESENCE_FRESH_MS = 60_000

// ─── Client-facing mutations ───────────────────────────────────────────────

// Heartbeat. Upserts a row (eventId, sessionId) → lastBeatAt = now. If this is the
// first fresh viewer for the event, wake the Chronoplace auto-burst chains so server
// sync resumes. Called by LiveScreen + AdminScreen every 30s.
export const beat = mutation({
  args: {
    eventId: v.id('events'),
    sessionId: v.string(),
    context: v.optional(v.string()),
  },
  handler: async (ctx, { eventId, sessionId, context }) => {
    const now = Date.now()
    const existing = await ctx.db
      .query('presence')
      .withIndex('by_event_session', (q) =>
        q.eq('eventId', eventId).eq('sessionId', sessionId),
      )
      .first()

    // Snapshot whether ANY fresh viewer existed BEFORE this beat. Used to decide if we
    // need to wake the auto-burst chains (transition from "nobody watching" to ≥1 viewer).
    const otherFresh = await ctx.db
      .query('presence')
      .withIndex('by_event', (q) => q.eq('eventId', eventId))
      .filter((q) =>
        q.and(
          q.gt(q.field('lastBeatAt'), now - PRESENCE_FRESH_MS),
          q.neq(q.field('sessionId'), sessionId),
        ),
      )
      .first()
    const hadOtherFreshViewer = !!otherFresh
    const wasStaleSelf = !existing || existing.lastBeatAt <= now - PRESENCE_FRESH_MS

    if (existing) {
      await ctx.db.patch(existing._id, { lastBeatAt: now, context })
    } else {
      await ctx.db.insert('presence', { eventId, sessionId, lastBeatAt: now, context })
    }

    // Wake the chains if this beat just transitioned the event from "no fresh viewer" to
    // "at least one fresh viewer" (i.e. nobody else was fresh AND we were stale/missing).
    if (!hadOtherFreshViewer && wasStaleSelf) {
      await ctx.scheduler.runAfter(0, internal.presence.wakeChains, { eventId })
    }
    return { ok: true, wokeChains: !hadOtherFreshViewer && wasStaleSelf }
  },
})

// Explicit leave on unmount. Best-effort: deleting frees DB rows faster than waiting
// for the 60s expiration window.
export const leave = mutation({
  args: { eventId: v.id('events'), sessionId: v.string() },
  handler: async (ctx, { eventId, sessionId }) => {
    const existing = await ctx.db
      .query('presence')
      .withIndex('by_event_session', (q) =>
        q.eq('eventId', eventId).eq('sessionId', sessionId),
      )
      .first()
    if (existing) await ctx.db.delete(existing._id)
  },
})

// ─── Internal helpers ──────────────────────────────────────────────────────

export const hasViewers = internalQuery({
  args: { eventId: v.id('events') },
  handler: async (ctx, { eventId }) => {
    const cutoff = Date.now() - PRESENCE_FRESH_MS
    const fresh = await ctx.db
      .query('presence')
      .withIndex('by_event', (q) => q.eq('eventId', eventId))
      .filter((q) => q.gt(q.field('lastBeatAt'), cutoff))
      .first()
    return !!fresh
  },
})

// Called when a viewer becomes the first fresh one for an event. Loops every
// Chronoplace-enabled team of the event and schedules its next auto burst so the
// chain re-starts without the user clicking anything.
export const wakeChains = internalMutation({
  args: { eventId: v.id('events') },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId)
    if (!event || event.status !== 'running' || (event as any).actualEnd) return null
    const teams = await ctx.db
      .query('teams')
      .withIndex('by_event', (q) => q.eq('eventId', eventId))
      .collect()
    let woken = 0
    for (const t of teams) {
      if (!(t as any).chronoSyncEnabled || !(t as any).chronoplaceSlug) continue
      if ((t as any).finishedAt) continue
      await ctx.scheduler.runAfter(0, internal.chronoplace.scheduleNextAutoBurst, {
        teamId: t._id,
      })
      woken++
    }
    return { woken }
  },
})

// Lazy GC: delete heartbeats older than 5×PRESENCE_FRESH_MS for the given event.
// Called opportunistically by chronoplace.ts so stale rows don't pile up forever.
export const sweepStale = internalMutation({
  args: { eventId: v.id('events') },
  handler: async (ctx, { eventId }) => {
    const cutoff = Date.now() - PRESENCE_FRESH_MS * 5
    const rows = await ctx.db
      .query('presence')
      .withIndex('by_event', (q) => q.eq('eventId', eventId))
      .filter((q) => q.lt(q.field('lastBeatAt'), cutoff))
      .collect()
    for (const r of rows) await ctx.db.delete(r._id)
    return { deleted: rows.length }
  },
})
