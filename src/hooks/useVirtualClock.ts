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

const LIVE_THRESHOLD_PCT = 99.5
const TICK_MS = 250

export function useVirtualClock(
  startTime: number,
  testModeDivider?: number,
  options?: UseVirtualClockOptions,
): UseVirtualClockReturn {
  // Position relative on the slider track (0..100). 100 = pinned to live edge.
  const [sliderPct, setSliderPct] = useState<number>(100)
  // Tick state to force re-render so derived virtualNow stays fresh.
  const [, setTickNow] = useState<number>(() => Date.now())
  const lastUpdateRef = useRef<number>(0)

  void options

  // Auto-tick: re-render every TICK_MS so virtualNow derived from Date.now() stays current.
  useEffect(() => {
    const id = setInterval(() => setTickNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [])

  // Reset to live when testModeDivider changes (mock timestamps shift).
  useEffect(() => {
    lastUpdateRef.current = 0
    setSliderPct(100)
  }, [testModeDivider])

  const nowMs = Date.now()
  const totalMs = Math.max(1, nowMs - startTime)
  const virtualNow = startTime + (sliderPct / 100) * totalMs
  const isLive = sliderPct >= LIVE_THRESHOLD_PCT

  const goLive = useCallback(() => {
    lastUpdateRef.current = 0
    setSliderPct(100)
  }, [])

  const setVirtualNow = useCallback(
    (t: number) => {
      const now = Date.now()
      if (now - lastUpdateRef.current < 16) return
      lastUpdateRef.current = now
      const total = Math.max(1, now - startTime)
      const clamped = Math.max(startTime, Math.min(now, t))
      const pct = ((clamped - startTime) / total) * 100
      setSliderPct(Math.max(0, Math.min(100, pct)))
    },
    [startTime],
  )

  return { virtualNow, setVirtualNow, isLive, goLive }
}
