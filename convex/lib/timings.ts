// Centralised effective timings for an event.
// When event.testMode === true, fast values are returned to allow runtime testing
// of the cron auto-pass + relai handover logic in seconds instead of minutes.

export const TEST_TIMINGS = {
  minLapSec: 5,
  maxLapSec: 30,
  replaceAutoWindowSec: 3,
  relayTransitionSec: 2,
  // Anti-bounce cooldown after a manual action: cron skips ticks for this short window.
  // Distinct from replaceAutoWindowSec (UI replace-auto window).
  cronCooldownAfterManualSec: 1,
  // Default grace after expected lap end before cron fires an auto-pass.
  // Lets the team record a real-time late manual before auto-close.
  lateGraceSec: 2,
}

export const DEFAULT_TIMINGS = {
  minLapSec: 165,
  maxLapSec: 480,
  replaceAutoWindowSec: 180,
  relayTransitionSec: 5,
  cronCooldownAfterManualSec: 10,
  lateGraceSec: 45,
}

// Returns the effective timing values for an event document. Pure function.
export function getEffectiveTimings(event: any): typeof TEST_TIMINGS {
  if (event?.testMode) return TEST_TIMINGS
  return {
    minLapSec: event?.minLapSec ?? DEFAULT_TIMINGS.minLapSec,
    maxLapSec: event?.maxLapSec ?? DEFAULT_TIMINGS.maxLapSec,
    replaceAutoWindowSec: event?.replaceAutoWindowSec ?? DEFAULT_TIMINGS.replaceAutoWindowSec,
    relayTransitionSec: event?.relayTransitionSec ?? DEFAULT_TIMINGS.relayTransitionSec,
    cronCooldownAfterManualSec: DEFAULT_TIMINGS.cronCooldownAfterManualSec,
    lateGraceSec: event?.lateGraceSec ?? DEFAULT_TIMINGS.lateGraceSec,
  }
}

// Lock window before scheduledStart during which testMode cannot be toggled (back or forth)
export const TEST_MODE_LOCK_WINDOW_MS = 10 * 60 * 1000
