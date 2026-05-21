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
  isPlaying: boolean
  play: () => void
  pause: () => void
  togglePlay: () => void
}

const TICK_MS = 250

export function useVirtualClock(
  startTime: number,
  testModeDivider?: number,
  options?: UseVirtualClockOptions,
): UseVirtualClockReturn {
  const endTime = options?.endTime ?? options?.maxTime
  const [sliderMs, setSliderMs] = useState<number>(() => Math.max(0, Date.now() - startTime))
  const [isLive, setIsLive] = useState<boolean>(true)
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  const lastUpdateRef = useRef<number>(0)

  // Auto-tick: live → track real time; playing (not live) → advance sliderMs by TICK_MS; paused → frozen.
  useEffect(() => {
    const id = setInterval(() => {
      if (isLive) {
        setSliderMs(Math.max(0, Date.now() - startTime))
      } else if (isPlaying) {
        setSliderMs((prev) => {
          const next = prev + TICK_MS
          const upper = endTime ? endTime - startTime : Math.max(0, Date.now() - startTime)
          if (next >= upper) {
            setIsPlaying(false)
            return upper
          }
          return next
        })
      } else {
        // Paused — force re-render so derived (rewind decalage) refreshes
        setSliderMs((v) => v)
      }
    }, TICK_MS)
    return () => clearInterval(id)
  }, [isLive, isPlaying, startTime, endTime])

  // Reset to live when testModeDivider changes
  useEffect(() => {
    lastUpdateRef.current = 0
    setSliderMs(Math.max(0, Date.now() - startTime))
    setIsLive(true)
    setIsPlaying(false)
  }, [testModeDivider, startTime])

  const goLive = useCallback(() => {
    lastUpdateRef.current = 0
    setSliderMs(Math.max(0, Date.now() - startTime))
    setIsLive(true)
    setIsPlaying(false)
  }, [startTime])

  const play = useCallback(() => {
    setIsPlaying(true)
  }, [])

  const pause = useCallback(() => {
    setIsPlaying(false)
  }, [])

  const togglePlay = useCallback(() => {
    setIsPlaying((p) => !p)
  }, [])

  const setVirtualNow = useCallback(
    (t: number) => {
      const now = Date.now()
      if (now - lastUpdateRef.current < 16) return
      lastUpdateRef.current = now
      const maxBound = endTime ?? now
      const clamped = Math.max(startTime, Math.min(maxBound, t))
      const ms = clamped - startTime
      setSliderMs(ms)
      const live = clamped >= now - 1000
      setIsLive(live)
      // Drag pauses playback (user takes control)
      if (!live) setIsPlaying(false)
    },
    [startTime, endTime],
  )

  const virtualNow = startTime + sliderMs

  return { virtualNow, setVirtualNow, isLive, goLive, isPlaying, play, pause, togglePlay }
}
