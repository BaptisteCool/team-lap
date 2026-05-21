import { useDeferredValue, useEffect, useRef, useState } from 'react'
import { useQuery } from '../convex/hooks'

export type FutureLap = {
  teamId: string
  runnerId: string | null
  timestamp: number
  lapTime: number
  lapNumber: number
  type: string
  prevCurrentIdx?: number
}

export type UseFutureSnapshotReturn = {
  laps: FutureLap[] | null
  isLoading: boolean
  error: Error | null
}

const FUTURE_THRESHOLD_MS = 1000

export function useFutureSnapshot(
  eventId: string | undefined,
  virtualNow: number,
  testMode: boolean,
): UseFutureSnapshotReturn {
  const isFuture = testMode && virtualNow > Date.now() + FUTURE_THRESHOLD_MS

  const deferredVirtualNow = useDeferredValue(virtualNow)

  const result = useQuery(
    'chronoplace:getMockSnapshotAt' as any,
    isFuture && eventId
      ? { eventId, virtualNow: deferredVirtualNow }
      : 'skip',
  ) as FutureLap[] | null | undefined

  const lastValidRef = useRef<FutureLap[] | null>(null)
  if (result !== undefined && result !== null) {
    lastValidRef.current = result
  }

  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!isFuture) setError(null)
  }, [isFuture])

  const isLoading = isFuture && result === undefined

  return {
    laps: isFuture
      ? (result ?? lastValidRef.current)
      : null,
    isLoading,
    error,
  }
}
