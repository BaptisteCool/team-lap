import { RotateCcw } from 'lucide-react'
import React, { useMemo, useState } from 'react'

export type RelayTickInput =
  | number
  | { timestamp: number; teamName?: string; runnerName?: string }

export type TestModeTimelapseSliderProps = {
  testMode: boolean
  startTime: number
  endTime?: number
  virtualNow: number
  setVirtualNow: (t: number) => void
  isLive: boolean
  goLive: () => void
  relayTicks?: RelayTickInput[]
  snapToTicks?: boolean
}

type DerivedTick = {
  timestamp: number
  label: string
  teamName?: string
  runnerName?: string
}

type ZoomLevel = { label: string; ms: number | null }

const ZOOM_LEVELS: ZoomLevel[] = [
  { label: '5m', ms: 5 * 60 * 1000 },
  { label: '30m', ms: 30 * 60 * 1000 },
  { label: '1h', ms: 60 * 60 * 1000 },
  { label: '6h', ms: 6 * 60 * 60 * 1000 },
  { label: 'all', ms: null },
]

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
  const [zoomMs, setZoomMs] = useState<number | null>(null)

  const nowMs = Date.now()
  const fullUpper = endTime ?? nowMs
  const fullLower = startTime

  // Window = visible slider range. When zoomed, centered on virtualNow + clamped to [fullLower, fullUpper].
  let windowStart = fullLower
  let windowEnd = fullUpper
  if (zoomMs && zoomMs < fullUpper - fullLower) {
    const half = zoomMs / 2
    let ws = virtualNow - half
    let we = virtualNow + half
    if (ws < fullLower) {
      we += (fullLower - ws)
      ws = fullLower
    }
    if (we > fullUpper) {
      const overflow = we - fullUpper
      we = fullUpper
      ws = Math.max(fullLower, ws - overflow)
    }
    windowStart = ws
    windowEnd = we
  }

  const windowMs = Math.max(1, windowEnd - windowStart)
  const sliderValue = Math.max(0, virtualNow - windowStart)
  const fillPct = Math.min(100, Math.max(0, (sliderValue / windowMs) * 100))
  const liveOffset = nowMs - windowStart
  const livePct = (liveOffset / windowMs) * 100
  const liveInWindow = nowMs >= windowStart && nowMs <= windowEnd

  const derivedTicks = useMemo<DerivedTick[]>(() => {
    if (!relayTicks || relayTicks.length === 0) return []
    const normalized = relayTicks.map((t) =>
      typeof t === 'number' ? { timestamp: t } : t,
    )
    return normalized
      .slice()
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((t, i) => ({
        timestamp: t.timestamp,
        label: `R${i + 1}`,
        teamName: t.teamName,
        runnerName: t.runnerName,
      }))
  }, [relayTicks])

  function isNearTick(tick: DerivedTick): boolean {
    return Math.abs(tick.timestamp - virtualNow) <= 2 * 60 * 1000
  }

  function tickPct(ts: number): number {
    return ((ts - windowStart) / windowMs) * 100
  }

  function isTickVisible(ts: number): boolean {
    // Only filter when zoomed in; full view always renders all ticks (clamped).
    if (zoomMs == null) return true
    return ts >= windowStart && ts <= windowEnd
  }

  function handleInput(e: React.FormEvent<HTMLInputElement>) {
    const val = Number((e.target as HTMLInputElement).value)
    setVirtualNow(windowStart + val)
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

  const decalageMs = nowMs - virtualNow
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

        <div className="time-scrubber-zoom" role="group" aria-label="Zoom temporel">
          {ZOOM_LEVELS.map((z) => (
            <button
              key={z.label}
              type="button"
              className={`time-scrubber-zoom-btn${zoomMs === z.ms ? ' is-active' : ''}`}
              onClick={() => setZoomMs(z.ms)}
              aria-pressed={zoomMs === z.ms}
            >
              {z.label}
            </button>
          ))}
        </div>

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
        {liveInWindow && (
          <span
            className="time-scrubber-live-marker"
            style={{ left: `${livePct}%` }}
            aria-hidden="true"
          />
        )}
        <input
          type="range"
          min={0}
          max={windowMs}
          value={sliderValue}
          step={1}
          aria-label="Scrubber temporel — position dans la course"
          aria-valuemin={0}
          aria-valuemax={windowMs}
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
          {derivedTicks.filter((t) => isTickVisible(t.timestamp)).map((tick) => (
            <button
              key={tick.timestamp}
              data-testid="relay-tick"
              className={`time-scrubber-tick${isNearTick(tick) ? ' is-active' : ''}`}
              style={{ left: `${tickPct(tick.timestamp)}%` }}
              onClick={() => handleTickClick(tick.timestamp)}
              aria-label={`Jump au relais ${tick.label}${tick.teamName ? ` — ${tick.teamName}` : ''}${tick.runnerName ? ` · ${tick.runnerName}` : ''} · ${formatHHmm(tick.timestamp)}`}
              title={`${tick.label}${tick.teamName ? ` — ${tick.teamName}` : ''}${tick.runnerName ? ` · ${tick.runnerName}` : ''} · ${formatHHmm(tick.timestamp)}`}
              type="button"
            >
              <span className="time-scrubber-tick-line" />
              <span className="time-scrubber-tick-label">{tick.label}</span>
              {tick.teamName && (
                <span className="time-scrubber-tick-team">{tick.teamName}</span>
              )}
              {tick.runnerName && (
                <span className="time-scrubber-tick-runner">→ {tick.runnerName}</span>
              )}
              <span className="time-scrubber-tick-time">{formatHHmm(tick.timestamp)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
