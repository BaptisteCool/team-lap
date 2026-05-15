import { cronJobs } from 'convex/server'
import { api, internal } from './_generated/api'

const crons = cronJobs()

// Tick every 5s — auto passage / auto relay detection (cloud only; local backend has client poller fallback)
crons.interval(
  'auto lap tick',
  { seconds: 5 },
  api.laps.autoTick,
)

// Refresh weather forecast for all active events every hour (Open-Meteo).
crons.interval(
  'weather refresh',
  { hours: 1 },
  internal.weather.refreshAllActive,
)

export default crons
