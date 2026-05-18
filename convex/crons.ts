import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

// Refresh weather forecast for all active events every 10 minutes (Met.no).
crons.interval(
  'weather refresh',
  { minutes: 10 },
  internal.weather.refreshAllActive,
)

// NOTE — auto-pass / auto-relay (autoTick) and Chronoplace sync have been
// removed from server crons. Both flows are now client-driven:
//   • Chronoplace teams: LiveScreen + AdminScreen poll `chronoplace.dispatchSync`
//     and `chronoplace.forceSyncTeam` while visible.
//   • Non-Chronoplace teams: client poller fallback already invokes `laps.autoTick`
//     from the team UI when needed.

export default crons
