import { RotateCcw } from 'lucide-react'
import React, { useMemo, useState } from 'react'

export type TestModeTimelapseSliderProps = {
  testMode: boolean
  startTime: number
  endTime?: number
  virtualNow: number
  setVirtualNow: (t: number) => void
  isLive: boolean
  goLive: () => void
  relayTicks?: number[]
  snapToTicks?: boolean
}

type DerivedTick = {
  timestamp: number
  label: string
}

function formatHHmm(ts: number): string {
  const d = new Date(ts)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

function formatDecalage(ms: number): string {
  const totalMin = Math.round(ms / 60_000)
  if (totalMin < 60) return `${totalMin}min`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}h ${m}min`
}

export function TestModeTimelapseSlider({
  testMode,
  startTime,
  endTime,
  virtualNow,
  setVirtualNow,
  isLive,
  goLive,
  relayTicks,
  snapToTicks = true,
}: TestModeTimelapseSliderProps): React.ReactElement | null {
  if (!testMode) return null

  const [isDragging, setIsDragging] = useState(false)

  const nowMs = Date.now()
  const upperBound = endTime ?? nowMs
  const totalMs = Math.max(1, upperBound - startTime)
  const sliderValue = virtualNow - startTime
  const fillPct = Math.min(100, Math.max(0, (sliderValue / totalMs) * 100))
  const livePct = Math.min(100, Math.max(0, ((nowMs - startTime) / totalMs) * 100))

  const derivedTicks = useMemo<DerivedTick[]>(() => {
    if (!relayTicks || relayTicks.length === 0) return []
    return relayTicks
      .slice()
      .sort((a, b) => a - b)
      .map((ts, i) => ({ timestamp: ts, label: `R${i + 1}` }))
  }, [relayTicks])

  function isNearTick(tick: DerivedTick): boolean {
    return Math.abs(tick.timestamp - virtualNow) <= 2 * 60 * 1000
  }

  function tickPct(ts: number): number {
    if (totalMs <= 0) return 0
    return Math.min(100, Math.max(0, ((ts - startTime) / totalMs) * 100))
  }

  function handleInput(e: React.FormEvent<HTMLInputElement>) {
    const val = Number((e.target as HTMLInputElement).value)
    setVirtualNow(startTime + val)
  }

  function handleMouseDown() {
    setIsDragging(true)
  }

  function handleMouseUp() {
    setIsDragging(false)
    if (snapToTicks && derivedTicks.length > 0) {
      const TWO_MINUTES = 2 * 60 * 1000
      const closest = derivedTicks.reduce((best, tick) =>
        Math.abs(tick.timestamp - virtualNow) < Math.abs(best.timestamp - virtualNow)
          ? tick
          : best,
      )
      if (Math.abs(closest.timestamp - virtualNow) <= TWO_MINUTES) {
        setVirtualNow(closest.timestamp)
      }
    }
  }

  function handleTickClick(ts: number) {
    setVirtualNow(ts)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const ONE_MIN = 60_000
    const TEN_MIN = 600_000
    let delta = 0

    switch (e.key) {
      case 'ArrowLeft':
        delta = e.shiftKey ? -TEN_MIN : -ONE_MIN
        break
      case 'ArrowRight':
        delta = e.shiftKey ? +TEN_MIN : +ONE_MIN
        break
      case 'Home':
        e.preventDefault()
        setVirtualNow(startTime)
        return
      case 'End':
        e.preventDefault()
        goLive()
        return
      default:
        return
    }

    e.preventDefault()
    setVirtualNow(virtualNow + delta)
  }

  const decalageMs = Date.now() - virtualNow
  const decalageLabel = formatDecalage(decalageMs)

  return (
    <div
      className="time-scrubber"
      role="group"
      aria-label="Controle temporel — scrubber de test"
    >
      <div className="time-scrubber-row">
        <div aria-live="polite" aria-atomic="true">
          {!isLive && (
            <span className="badge warn" data-testid="rewind-badge">
              <RotateCcw size={16} />
              REWIND -{decalageLabel}
            </span>
          )}
        </div>

        <time
          className={`mono${!isLive ? ' is-rewind' : ''}`}
          aria-label="Position temporelle actuelle"
        >
          {formatHHmm(virtualNow)}
        </time>

        <button
          className={`live-pill${isLive ? ' is-live' : ''}`}
          onClick={isLive ? undefined : goLive}
          disabled={isLive}
          title={isLive ? undefined : 'Revenir au temps reel'}
        >
          <span className="live-dot" />
          LIVE
        </button>
      </div>

      <div
        className="time-scrubber-track"
        style={{ '--fill-pct': `${fillPct}%`, '--live-pct': `${livePct}%` } as React.CSSProperties}
      >
        {endTime && livePct < 100 && (
          <span
            className="time-scrubber-live-marker"
            style={{ left: `${livePct}%` }}
            aria-hidden="true"
          />
        )}
        <input
          type="range"
          min={0}
          max={totalMs}
          value={sliderValue}
          step={1}
          aria-label="Scrubber temporel — position dans la course"
          aria-valuemin={0}
          aria-valuemax={totalMs}
          aria-valuenow={sliderValue}
          aria-valuetext={`${formatHHmm(virtualNow)} — ${isLive ? 'live' : decalageLabel}`}
          onInput={handleInput}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onTouchStart={handleMouseDown}
          onTouchEnd={handleMouseUp}
          onKeyDown={handleKeyDown}
          onChange={() => {}}
        />

        <div
          className="time-scrubber-thumb"
          style={{
            left: `${fillPct}%`,
            width: isDragging ? 24 : 20,
            height: isDragging ? 24 : 20,
          }}
          aria-hidden="true"
        />

        <div className="time-scrubber-ticks" aria-hidden="true">
          {derivedTicks.map((tick) => (
            <button
              key={tick.timestamp}
              data-testid="relay-tick"
              className={`time-scrubber-tick${isNearTick(tick) ? ' is-active' : ''}`}
              style={{ left: `${tickPct(tick.timestamp)}%` }}
              onClick={() => handleTickClick(tick.timestamp)}
              aria-label={`Jump au relais ${tick.label} · ${formatHHmm(tick.timestamp)}`}
              type="button"
            >
              <span className="time-scrubber-tick-line" />
              <span className="time-scrubber-tick-label">{tick.label}</span>
              <span className="time-scrubber-tick-time">{formatHHmm(tick.timestamp)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
