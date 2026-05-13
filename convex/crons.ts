import { cronJobs } from 'convex/server'
import { api } from './_generated/api'

const crons = cronJobs()

// Tick every 5s — auto passage / auto relay detection (cloud only; local backend has client poller fallback)
crons.interval(
  'auto lap tick',
  { seconds: 5 },
  api.laps.autoTick,
)

export default crons
