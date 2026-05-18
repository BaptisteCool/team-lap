// Centralised effective timings for an event.
// When event.testMode === true, all duration-like values are divided by
// `event.testModeDivider` (default 3) so the same race can be exercised faster
// without redefining each individual constant.

export const DEFAULT_TEST_DIVIDER = 3

export const DEFAULT_TIMINGS = {
  // Window after an auto lap during which a manual click REPLACES it.
  replaceAutoWindowSec: 180,
  // Relay handover penalty applied to a relay lap's expected time + lapTime.
  relayTransitionSec: 5,
  // Anti-bounce cooldown after a manual action: cron-style auto skips ticks for this window.
  cronCooldownAfterManualSec: 10,
  // Grace after expected lap end before the burst chain gives up on this lap.
  lateGraceSec: 45,
}

export interface EffectiveTimings {
  replaceAutoWindowSec: number
  relayTransitionSec: number
  cronCooldownAfterManualSec: number
  lateGraceSec: number
  testModeDivider: number
  // True when divider is applied (i.e. event.testMode === true and divider > 1).
  testMode: boolean
}

// Returns the effective timing values for an event document. Pure function.
export function getEffectiveTimings(event: any): EffectiveTimings {
  const testMode = event?.testMode === true
  const rawDivider = event?.testModeDivider ?? DEFAULT_TEST_DIVIDER
  const divider = testMode && rawDivider > 0 ? rawDivider : 1
  return {
    replaceAutoWindowSec: Math.max(
      1,
      Math.round((event?.replaceAutoWindowSec ?? DEFAULT_TIMINGS.replaceAutoWindowSec) / divider),
    ),
    relayTransitionSec: Math.max(
      1,
      Math.round((event?.relayTransitionSec ?? DEFAULT_TIMINGS.relayTransitionSec) / divider),
    ),
    cronCooldownAfterManualSec: Math.max(
      1,
      Math.round(DEFAULT_TIMINGS.cronCooldownAfterManualSec / divider),
    ),
    lateGraceSec: Math.max(
      1,
      Math.round((event?.lateGraceSec ?? DEFAULT_TIMINGS.lateGraceSec) / divider),
    ),
    testModeDivider: divider,
    testMode,
  }
}

// Lock window before scheduledStart during which testMode cannot be toggled (back or forth)
export const TEST_MODE_LOCK_WINDOW_MS = 10 * 60 * 1000
