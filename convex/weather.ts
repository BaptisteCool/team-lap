import { v } from 'convex/values'
import { action, internalMutation, internalQuery, query } from './_generated/server'
import { api, internal } from './_generated/api'

const TTL_MS = 10 * 60 * 1000 // 10 min

// Provider IDs supported by the backend. UI may show others (e.g. 'meteo-france') as placeholders.
// Note: Open-Meteo retiré (données peu fiables sur tests France) — Met.no source de référence.
export const SUPPORTED_PROVIDERS = ['met-no'] as const
export type ProviderId = typeof SUPPORTED_PROVIDERS[number]
const DEFAULT_PROVIDER: ProviderId = 'met-no'

// ─── Provider adapters ─────────────────────────────────────────────────────
// Each adapter takes lat/lng and returns the same NORMALIZED hourly shape the
// front already consumes (kept identical to the Open-Meteo payload from #7 to
// avoid touching WeatherSummaryBanner / WeatherBadge prop types).

interface NormalizedHourly {
  time: number[]
  temperature_2m: number[]
  relative_humidity_2m: number[]
  weather_code: number[]
  precipitation_probability: number[]
  timezone: string
  latitude: number
  longitude: number
}

async function fetchFromOpenMeteo(lat: number, lng: number): Promise<NormalizedHourly> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    hourly: 'temperature_2m,relative_humidity_2m,weather_code,precipitation_probability',
    timezone: 'auto',
    forecast_days: '7',
  })
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`)
  if (!res.ok) throw new Error(`OPEN_METEO_HTTP_${res.status}`)
  const json: any = await res.json()
  const times: string[] = json?.hourly?.time || []
  return {
    time: times.map((t) => new Date(t).getTime()),
    temperature_2m: json?.hourly?.temperature_2m || [],
    relative_humidity_2m: json?.hourly?.relative_humidity_2m || [],
    weather_code: json?.hourly?.weather_code || [],
    precipitation_probability: json?.hourly?.precipitation_probability || [],
    timezone: json?.timezone || 'auto',
    latitude: lat,
    longitude: lng,
  }
}

// Met.no symbol-code → WMO-equivalent best-effort mapping (reusing existing weather-codes.ts on the front).
// Met.no docs: https://api.met.no/weatherapi/locationforecast/2.0/documentation
function metNoSymbolToWmo(symbol: string): number {
  if (!symbol) return 0
  const s = symbol.replace(/_(day|night|polartwilight)$/, '')
  const map: Record<string, number> = {
    clearsky: 0,
    fair: 1,
    partlycloudy: 2,
    cloudy: 3,
    fog: 45,
    lightrainshowers: 80,
    rainshowers: 80,
    heavyrainshowers: 82,
    lightrain: 61,
    rain: 63,
    heavyrain: 65,
    lightsleetshowers: 80,
    sleetshowers: 80,
    heavysleetshowers: 82,
    lightsleet: 67,
    sleet: 67,
    heavysleet: 67,
    lightsnowshowers: 85,
    snowshowers: 85,
    heavysnowshowers: 86,
    lightsnow: 71,
    snow: 73,
    heavysnow: 75,
    lightrainshowersandthunder: 95,
    rainshowersandthunder: 95,
    heavyrainshowersandthunder: 96,
    lightrainandthunder: 95,
    rainandthunder: 95,
    heavyrainandthunder: 96,
    lightsleetshowersandthunder: 95,
    sleetshowersandthunder: 95,
    heavysleetshowersandthunder: 96,
    lightsleetandthunder: 95,
    sleetandthunder: 95,
    heavysleetandthunder: 96,
    lightsnowshowersandthunder: 95,
    snowshowersandthunder: 95,
    heavysnowshowersandthunder: 96,
    lightsnowandthunder: 95,
    snowandthunder: 95,
    heavysnowandthunder: 96,
  }
  return map[s] ?? 0
}

async function fetchFromMetNo(lat: number, lng: number): Promise<NormalizedHourly> {
  // User-Agent obligatoire — sinon 403. Identifies the application to met.no operators.
  const res = await fetch(
    `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lng}`,
    { headers: { 'User-Agent': 'TeamLap/1.0 contact@teamlap.app' } },
  )
  if (!res.ok) throw new Error(`MET_NO_HTTP_${res.status}`)
  const json: any = await res.json()
  const series: any[] = json?.properties?.timeseries || []
  // Take up to 7 days × 24h = 168 entries (met.no provides hourly for ~48h, 6h after)
  const time: number[] = []
  const temperature_2m: number[] = []
  const relative_humidity_2m: number[] = []
  const weather_code: number[] = []
  const precipitation_probability: number[] = []
  for (const entry of series) {
    const ts = new Date(entry.time).getTime()
    const inst = entry?.data?.instant?.details || {}
    const next1h = entry?.data?.next_1_hours
    const next6h = entry?.data?.next_6_hours
    const symbol = next1h?.summary?.symbol_code || next6h?.summary?.symbol_code || ''
    const precipProb =
      next1h?.details?.probability_of_precipitation ??
      next6h?.details?.probability_of_precipitation ??
      // met.no doesn't always return probability — fall back to amount > 0 → 100, else 0
      (next1h?.details?.precipitation_amount ?? next6h?.details?.precipitation_amount ?? 0) > 0
        ? 100
        : 0
    time.push(ts)
    temperature_2m.push(typeof inst.air_temperature === 'number' ? inst.air_temperature : 0)
    relative_humidity_2m.push(typeof inst.relative_humidity === 'number' ? inst.relative_humidity : 0)
    weather_code.push(metNoSymbolToWmo(symbol))
    precipitation_probability.push(precipProb)
  }
  return {
    time,
    temperature_2m,
    relative_humidity_2m,
    weather_code,
    precipitation_probability,
    timezone: 'UTC', // met.no returns UTC; UI bucketing uses ms epoch → still correct
    latitude: lat,
    longitude: lng,
  }
}

// ─── Cache + actions ────────────────────────────────────────────────────────

export const writeCache = internalMutation({
  args: { eventId: v.id('events'), provider: v.string(), data: v.any() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('weather_cache')
      .withIndex('by_event_provider', (q) => q.eq('eventId', args.eventId).eq('provider', args.provider))
      .first()
    const now = Date.now()
    const patch = {
      eventId: args.eventId,
      provider: args.provider,
      fetchedAt: now,
      expiresAt: now + TTL_MS,
      data: args.data,
    }
    if (existing) {
      await ctx.db.patch(existing._id, patch)
    } else {
      await ctx.db.insert('weather_cache', patch)
    }
  },
})

export const fetchWeather = action({
  args: { eventId: v.id('events'), provider: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ ok: boolean; reason?: string; provider: string }> => {
    const provider: ProviderId =
      args.provider && (SUPPORTED_PROVIDERS as readonly string[]).includes(args.provider)
        ? (args.provider as ProviderId)
        : DEFAULT_PROVIDER
    const event = await ctx.runQuery(internal.weather.getEventLatLng, { eventId: args.eventId })
    if (!event || event.latitude == null || event.longitude == null) {
      return { ok: false, reason: 'NO_LAT_LNG', provider }
    }
    try {
      // Met.no = seule source supportée (Open-Meteo retiré — données peu fiables FR).
      // Helper fetchFromOpenMeteo conservé pour réactivation future.
      const data = await fetchFromMetNo(event.latitude, event.longitude)
      await ctx.runMutation(internal.weather.writeCache, { eventId: args.eventId, provider, data })
      return { ok: true, provider }
    } catch (err: any) {
      return { ok: false, reason: err?.message || 'FETCH_FAILED', provider }
    }
  },
})

export const refreshAllActive = internalMutation({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db.query('events').collect()
    const now = Date.now()
    for (const e of events) {
      if (e.status === 'finished') continue
      // Skip events whose race ended more than 10 min ago (aligned with cache TTL)
      if (e.scheduledEnd && e.scheduledEnd + 10 * 60 * 1000 < now) continue
      if ((e as any).latitude == null || (e as any).longitude == null) continue
      // Refresh every supported provider — clients may pick any of them at any time
      for (const provider of SUPPORTED_PROVIDERS) {
        await ctx.scheduler.runAfter(0, api.weather.fetchWeather, { eventId: e._id, provider })
      }
    }
  },
})

export const getEventLatLng = internalQuery({
  args: { eventId: v.id('events') },
  handler: async (ctx, args) => {
    const e = await ctx.db.get(args.eventId)
    if (!e) return null
    return { latitude: (e as any).latitude ?? null, longitude: (e as any).longitude ?? null }
  },
})

// Reactive query: returns cached forecast for a specific provider, or null.
export const getWeatherForEvent = query({
  args: { eventId: v.id('events'), provider: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const provider: ProviderId =
      args.provider && (SUPPORTED_PROVIDERS as readonly string[]).includes(args.provider)
        ? (args.provider as ProviderId)
        : DEFAULT_PROVIDER
    const cached = await ctx.db
      .query('weather_cache')
      .withIndex('by_event_provider', (q) => q.eq('eventId', args.eventId).eq('provider', provider))
      .first()
    if (!cached) return null
    return {
      provider,
      fetchedAt: cached.fetchedAt,
      expiresAt: cached.expiresAt,
      stale: Date.now() > cached.expiresAt,
      data: cached.data,
    }
  },
})
