// Pure helper — computes the next runner index in `order` based on team state + active group-mode entry.
// Reused by mutations (manual lap), cron autoTick, and UI projections to guarantee consistency.

export type GroupModeEntry = {
  groupName: string
  remainingRelays: number
  status: 'active' | 'pending'
}

export type RunnerLite = {
  id: string
  status?: string
  group?: string
}

export type NextRunnerInput = {
  order: string[]
  runners: RunnerLite[]
  currentIdx: number
  groupModeQueue?: GroupModeEntry[] | null
}

// Active entry = head of queue with status 'active'. Pending entries don't apply yet.
export function getActiveGroupEntry(queue: GroupModeEntry[] | null | undefined): GroupModeEntry | null {
  if (!queue || queue.length === 0) return null
  const head = queue[0]
  return head.status === 'active' ? head : null
}

// Resolve the runner local id at a given idx, skipping 'out' status. Falls back to the original idx if all out.
function findActiveAt(order: string[], runners: RunnerLite[], startIdx: number, allow: (r: RunnerLite) => boolean): number {
  if (order.length === 0) return 0
  for (let i = 0; i < order.length; i++) {
    const idx = (startIdx + i) % order.length
    const id = order[idx]
    const r = runners.find((x) => x.id === id)
    if (r && r.status !== 'out' && allow(r)) return idx
  }
  // No match — return original
  return startIdx % order.length
}

// Compute the next runner index AFTER a relay (i.e. when currentIdx must advance).
// If a group mode is active, restrict to runners whose .group === groupName.
// If no member of the group remains, fall back to the next non-out runner in the global order.
export function computeNextRunnerIdx(input: NextRunnerInput): number {
  const { order, runners, currentIdx } = input
  const active = getActiveGroupEntry(input.groupModeQueue)
  if (active) {
    const groupAllow = (r: RunnerLite) => r.group === active.groupName
    const groupHasAny = order.some((id) => {
      const r = runners.find((x) => x.id === id)
      return r && r.status !== 'out' && r.group === active.groupName
    })
    if (groupHasAny) {
      // Search starting AFTER currentIdx for next group member
      return findActiveAt(order, runners, (currentIdx + 1) % Math.max(1, order.length), groupAllow)
    }
    // group empty → fallback to global rotation
  }
  return findActiveAt(order, runners, (currentIdx + 1) % Math.max(1, order.length), () => true)
}

// Resolve the status of the next group entry given the runner currently in piste.
// 'active' if the current runner belongs to the group; 'pending' otherwise.
export function resolveGroupEntryStatus(entry: GroupModeEntry, currentRunner: RunnerLite | undefined): 'active' | 'pending' {
  if (currentRunner && currentRunner.group === entry.groupName) return 'active'
  return 'pending'
}

// Process the queue after a relay event:
// - If active entry: decrement remainingRelays. If 0 → pop. Recompute status of new head.
// - Returns the new queue (or undefined if empty).
export function consumeQueueOnRelay(
  queue: GroupModeEntry[] | null | undefined,
  newCurrentRunner: RunnerLite | undefined,
): GroupModeEntry[] | undefined {
  if (!queue || queue.length === 0) return undefined
  const next = queue.slice()
  const head = next[0]
  if (head.status === 'active') {
    head.remainingRelays = Math.max(0, head.remainingRelays - 1)
    if (head.remainingRelays === 0) {
      next.shift()
    }
  }
  // Recompute status of new head (could be pending if new current runner not in group)
  if (next.length > 0) {
    next[0] = { ...next[0], status: resolveGroupEntryStatus(next[0], newCurrentRunner) }
  }
  return next.length > 0 ? next : undefined
}
