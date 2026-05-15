import { v } from 'convex/values'
import { action, internalMutation, internalQuery, query } from './_generated/server'
import { api, internal } from './_generated/api'

const TTL_MS = 60 * 60 * 1000 // 1h

// Open-Meteo: hourly forecast (no API key). 16 days max.
function buildEndpoint(lat: number, lng: number): string {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    hourly: 'temperature_2m,relative_humidity_2m,weather_code,precipitation_probability',
    timezone: 'auto',
    forecast_days: '7',
  })
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`
}

// Internal mutation to write cache (called by the action — actions can't write directly).
export const writeCache = internalMutation({
  args: { eventId: v.id('events'), data: v.any() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('weather_cache')
      .withIndex('by_event', (q) => q.eq('eventId', args.eventId))
      .first()
    const now = Date.now()
    const patch = { eventId: args.eventId, fetchedAt: now, expiresAt: now + TTL_MS, data: args.data }
    if (existing) {
      await ctx.db.patch(existing._id, patch)
    } else {
      await ctx.db.insert('weather_cache', patch)
    }
  },
})

// Action: fetch Open-Meteo for an event and store in cache.
// Safe to call repeatedly — uses event's lat/lng.
export const fetchWeather = action({
  args: { eventId: v.id('events') },
  handler: async (ctx, args): Promise<{ ok: boolean; reason?: string }> => {
    const event = await ctx.runQuery(internal.weather.getEventLatLng, { eventId: args.eventId })
    if (!event || event.latitude == null || event.longitude == null) {
      return { ok: false, reason: 'NO_LAT_LNG' }
    }
    try {
      const res = await fetch(buildEndpoint(event.latitude, event.longitude))
      if (!res.ok) return { ok: false, reason: `HTTP_${res.status}` }
      const json: any = await res.json()
      // Convert ISO time strings to ms epoch for consistent client-side bucketing.
      const times: string[] = json?.hourly?.time || []
      const data = {
        time: times.map((t) => new Date(t).getTime()),
        temperature_2m: json?.hourly?.temperature_2m || [],
        relative_humidity_2m: json?.hourly?.relative_humidity_2m || [],
        weather_code: json?.hourly?.weather_code || [],
        precipitation_probability: json?.hourly?.precipitation_probability || [],
        timezone: json?.timezone || 'auto',
        latitude: event.latitude,
        longitude: event.longitude,
      }
      await ctx.runMutation(internal.weather.writeCache, { eventId: args.eventId, data })
      return { ok: true }
    } catch (err: any) {
      return { ok: false, reason: err?.message || 'FETCH_FAILED' }
    }
  },
})

// Cron entrypoint: schedule a weather refresh for every active event
// (status != 'finished' and within the upcoming-24h window of scheduledStart..scheduledEnd).
export const refreshAllActive = internalMutation({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db.query('events').collect()
    const now = Date.now()
    for (const e of events) {
      if (e.status === 'finished') continue
      // Skip events whose race ended more than 1h ago
      if (e.scheduledEnd && e.scheduledEnd + 60 * 60 * 1000 < now) continue
      // Skip events without lat/lng (nothing to fetch)
      if ((e as any).latitude == null || (e as any).longitude == null) continue
      await ctx.scheduler.runAfter(0, api.weather.fetchWeather, { eventId: e._id })
    }
  },
})

// Internal helper: read just the lat/lng of an event (used by the action).
export const getEventLatLng = internalQuery({
  args: { eventId: v.id('events') },
  handler: async (ctx, args) => {
    const e = await ctx.db.get(args.eventId)
    if (!e) return null
    return { latitude: (e as any).latitude ?? null, longitude: (e as any).longitude ?? null }
  },
})

// Public reactive query: returns cached forecast or null. Triggers a background
// refresh via scheduler.runAfter(0, ...) when cache is missing / expired.
// Defensive: never throws — UI degrades gracefully when null.
export const getWeatherForEvent = query({
  args: { eventId: v.id('events') },
  handler: async (ctx, args) => {
    const cached = await ctx.db
      .query('weather_cache')
      .withIndex('by_event', (q) => q.eq('eventId', args.eventId))
      .first()
    if (!cached) return null
    return {
      fetchedAt: cached.fetchedAt,
      expiresAt: cached.expiresAt,
      stale: Date.now() > cached.expiresAt,
      data: cached.data,
    }
  },
})

