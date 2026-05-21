import { useCallback, useEffect, useRef, useState } from 'react'

export type UseVirtualClockOptions = {
  maxTime?: number
  onVirtualNowChange?: (t: number) => void
}

export type UseVirtualClockReturn = {
  virtualNow: number
  setVirtualNow: (t: number) => void
  isLive: boolean
  goLive: () => void
}

export function useVirtualClock(
  startTime: number,
  testModeDivider?: number,
  options?: UseVirtualClockOptions,
): UseVirtualClockReturn {
  const [virtualNow, setRawVirtualNow] = useState<number>(() => Date.now())
  const [isLive, setIsLive] = useState<boolean>(true)
  const lastUpdateRef = useRef<number>(0)

  // Ignore Phase 1 unused options — kept for Phase 2 API stability
  void options

  const applyTime = useCallback(
    (t: number) => {
      const clamped = Math.max(startTime, Math.min(Date.now(), t))
      setRawVirtualNow(clamped)
      setIsLive(clamped >= Date.now() - 1000)
    },
    [startTime],
  )

  const goLive = useCallback(() => {
    lastUpdateRef.current = 0
    setRawVirtualNow(Date.now())
    setIsLive(true)
  }, [])

  const setVirtualNow = useCallback(
    (t: number) => {
      const now = Date.now()
      // Throttle: max 1 update per ~16ms frame (rAF equivalent, synchronous for testability)
      if (now - lastUpdateRef.current < 16) return
      lastUpdateRef.current = now
      applyTime(t)
    },
    [applyTime],
  )

  // Reset to live when testModeDivider changes (mock timestamps shift)
  useEffect(() => {
    lastUpdateRef.current = 0
    setRawVirtualNow(Date.now())
    setIsLive(true)
  }, [testModeDivider])

  return { virtualNow, setVirtualNow, isLive, goLive }
}
