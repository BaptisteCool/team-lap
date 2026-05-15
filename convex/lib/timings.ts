// Centralised effective timings for an event.
// When event.testMode === true, fast values are returned to allow runtime testing
// of the cron auto-pass + relai handover logic in seconds instead of minutes.

export const TEST_TIMINGS = {
  minLapSec: 5,
  maxLapSec: 30,
  replaceAutoWindowSec: 3,
  relayTransitionSec: 2,
}

export const DEFAULT_TIMINGS = {
  minLapSec: 165,
  maxLapSec: 480,
  replaceAutoWindowSec: 180,
  relayTransitionSec: 5,
}

// Returns the effective timing values for an event document. Pure function.
export function getEffectiveTimings(event: any): typeof TEST_TIMINGS {
  if (event?.testMode) return TEST_TIMINGS
  return {
    minLapSec: event?.minLapSec ?? DEFAULT_TIMINGS.minLapSec,
    maxLapSec: event?.maxLapSec ?? DEFAULT_TIMINGS.maxLapSec,
    replaceAutoWindowSec: event?.replaceAutoWindowSec ?? DEFAULT_TIMINGS.replaceAutoWindowSec,
    relayTransitionSec: event?.relayTransitionSec ?? DEFAULT_TIMINGS.relayTransitionSec,
  }
}

// Lock window before scheduledStart during which testMode cannot be toggled (back or forth)
export const TEST_MODE_LOCK_WINDOW_MS = 10 * 60 * 1000
