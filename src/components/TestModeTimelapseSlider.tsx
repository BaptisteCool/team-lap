// STUB — not implemented yet (#31)
// This file is a placeholder so test imports resolve.
// Replace with real implementation.
import React from 'react'

export interface TestModeTimelapseSliderProps {
  testMode: boolean
  startTime: number
  virtualNow: number
  setVirtualNow: (t: number) => void
  goLive: () => void
  isLive: boolean
  relayTicks?: number[]
}

export function TestModeTimelapseSlider(_props: TestModeTimelapseSliderProps): React.ReactElement | null {
  throw new Error('TestModeTimelapseSlider: not implemented yet (#31)')
}
