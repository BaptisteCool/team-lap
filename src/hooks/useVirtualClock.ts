import { useCallback, useEffect, useRef, useState } from 'react'

export type UseVirtualClockOptions = {
  endTime?: number
  maxTime?: number
  onVirtualNowChange?: (t: number) => void
}

export type UseVirtualClockReturn = {
  virtualNow: number
  setVirtualNow: (t: number) => void
  isLive: boolean
  goLive: () => void
}

const TICK_MS = 250

export function useVirtualClock(
  startTime: number,
  testModeDivider?: number,
  options?: UseVirtualClockOptions,
): UseVirtualClockReturn {
  const endTime = options?.endTime ?? options?.maxTime
  // sliderMs = offset from startTime to current slider position (ms). When isLive, this tracks Date.now()-startTime.
  const [sliderMs, setSliderMs] = useState<number>(() => Math.max(0, Date.now() - startTime))
  const [isLive, setIsLive] = useState<boolean>(true)
  const lastUpdateRef = useRef<number>(0)

  // Auto-tick: when live, slider tracks real time; also forces re-render so derived values stay fresh.
  useEffect(() => {
    const id = setInterval(() => {
      if (isLive) {
        setSliderMs(Math.max(0, Date.now() - startTime))
      } else {
        // force re-render to refresh derived (rewind decalage etc.)
        setSliderMs((v) => v)
      }
    }, TICK_MS)
    return () => clearInterval(id)
  }, [isLive, startTime])

  // Reset to live when testModeDivider changes
  useEffect(() => {
    lastUpdateRef.current = 0
    setSliderMs(Math.max(0, Date.now() - startTime))
    setIsLive(true)
  }, [testModeDivider, startTime])

  const goLive = useCallback(() => {
    lastUpdateRef.current = 0
    setSliderMs(Math.max(0, Date.now() - startTime))
    setIsLive(true)
  }, [startTime])

  const setVirtualNow = useCallback(
    (t: number) => {
      const now = Date.now()
      if (now - lastUpdateRef.current < 16) return
      lastUpdateRef.current = now
      const maxBound = endTime ?? now
      const clamped = Math.max(startTime, Math.min(maxBound, t))
      const ms = clamped - startTime
      setSliderMs(ms)
      // Consider "live" if within 1s of real now AND no endTime override (or at/past current real position)
      setIsLive(clamped >= now - 1000)
    },
    [startTime, endTime],
  )

  const virtualNow = startTime + sliderMs

  return { virtualNow, setVirtualNow, isLive, goLive }
}
