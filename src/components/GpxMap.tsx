import { useEffect, useRef, useState } from 'react'
import { GPX_PATH, GPX_VIEWBOX } from '../lib/race-data'

interface Marker {
  id: string
  color: string
  progress: number
  label?: string
  subLabel?: string
}

interface GpxMapProps {
  height?: number
  marker?: { x: number; y: number }
  progress?: number
  showLabel?: boolean
  markers?: Marker[]
  markerLabel?: string
  markerSubLabel?: string
  markerColor?: string
  lapDistanceM?: number
  instantUpdate?: boolean
  dimmed?: boolean
}

export function GpxMap({ height, marker, progress, showLabel = true, markers, markerLabel, markerSubLabel, markerColor, lapDistanceM, instantUpdate = false, dimmed = false }: GpxMapProps) {
  const pathRef = useRef<SVGPathElement>(null)
  const [computedMarker, setComputedMarker] = useState<{ x: number; y: number } | null>(null)
  const [computedMulti, setComputedMulti] = useState<Array<Marker & { x: number; y: number }>>([])
  // Track which marker ids have been positioned at least once — to skip transition on first paint
  const seenIdsRef = useRef<Set<string>>(new Set())
  const [, setSeenVersion] = useState(0)
  const [singleSeen, setSingleSeen] = useState(false)
  // Per-marker last progress — detect lap wrap (progress decreasing significantly) to skip transition
  const lastProgressRef = useRef<Map<string, number>>(new Map())
  const wrappedIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (progress == null || !pathRef.current) {
      setComputedMarker(null)
      setSingleSeen(false)
      return
    }
    const len = pathRef.current.getTotalLength()
    const p = ((progress % 1) + 1) % 1
    const pt = pathRef.current.getPointAtLength(len * p)
    setComputedMarker({ x: pt.x, y: pt.y })
    if (!singleSeen) {
      // Enable transition after first paint
      requestAnimationFrame(() => setSingleSeen(true))
    }
  }, [progress])

  useEffect(() => {
    if (!Array.isArray(markers) || !pathRef.current) {
      setComputedMulti([])
      return
    }
    const len = pathRef.current.getTotalLength()
    const wrapped = new Set<string>()
    const computed = markers.map(mk => {
      const p = ((mk.progress % 1) + 1) % 1
      const prev = lastProgressRef.current.get(mk.id)
      // Detect lap wrap: progress jumped backward by > 0.5 → completed a lap
      if (prev != null && prev - p > 0.5) wrapped.add(mk.id)
      lastProgressRef.current.set(mk.id, p)
      const pt = pathRef.current!.getPointAtLength(len * p)
      return { ...mk, x: pt.x, y: pt.y }
    })
    wrappedIdsRef.current = wrapped
    setComputedMulti(computed)
    // Mark new ids as seen on next frame so first paint skips transition
    const newIds = computed.filter((mk) => !seenIdsRef.current.has(mk.id)).map((mk) => mk.id)
    if (newIds.length > 0) {
      requestAnimationFrame(() => {
        for (const id of newIds) seenIdsRef.current.add(id)
        setSeenVersion((v) => v + 1)
      })
    }
  }, [markers])

  const m = marker || computedMarker

  return (
    <div className="map-wrap" style={height ? { height } : undefined}>
      <svg viewBox={GPX_VIEWBOX} preserveAspectRatio="xMidYMid meet" style={{ height: '100%', width: '100%' }}>
        <defs>
          <linearGradient id="trackGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="oklch(0.86 0.20 135)" />
            <stop offset="100%" stopColor="oklch(0.78 0.18 160)" />
          </linearGradient>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.025)" strokeWidth="1"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        {/* shadow path */}
        <path d={GPX_PATH} fill="none" stroke="rgba(166,240,96,0.08)" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round"/>
        <path ref={pathRef} d={GPX_PATH} fill="none" stroke="url(#trackGrad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        {/* START_FINISH_CHECKPOINT */}
        <g transform="translate(99 121)">
          <line x1="-14" y1="0" x2="14" y2="0" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round"/>
          <circle r="9" fill="none" stroke="var(--accent)" strokeWidth="1.5" opacity="0.6">
            <animate attributeName="r" values="6;14;6" dur="1.8s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="0.7;0;0.7" dur="1.8s" repeatCount="indefinite"/>
          </circle>
          <circle r="3.5" fill="var(--accent)" stroke="var(--bg)" strokeWidth="1.5"/>
        </g>
        <g opacity={dimmed ? 0.65 : 1}>
          {m && (
            <g
              transform={`translate(${m.x} ${m.y})`}
              style={{ transition: instantUpdate ? 'none' : (singleSeen ? 'transform 350ms linear' : 'none') }}
            >
              <circle r="14" fill={markerColor || 'var(--warn)'} opacity="0.18">
                <animate attributeName="r" values="12;18;12" dur="1.6s" repeatCount="indefinite"/>
                <animate attributeName="opacity" values="0.25;0.05;0.25" dur="1.6s" repeatCount="indefinite"/>
              </circle>
              <circle r="7" fill={markerColor || 'var(--warn)'} stroke="var(--bg)" strokeWidth="2"/>
              {markerLabel && (
                <text x="13" y="-9" fill="var(--text)" fontSize="11" fontWeight="700"
                      style={{ paintOrder: 'stroke', stroke: 'var(--bg)', strokeWidth: 3, strokeLinejoin: 'round' }}>
                  {markerLabel}
                </text>
              )}
              {markerSubLabel && (
                <text x="13" y="5" fill="var(--text-2)" fontSize="10" fontWeight="600"
                      style={{ paintOrder: 'stroke', stroke: 'var(--bg)', strokeWidth: 2.5, strokeLinejoin: 'round' }}>
                  {markerSubLabel}
                </text>
              )}
            </g>
          )}
          {computedMulti.map(mk => {
            const seen = seenIdsRef.current.has(mk.id)
            const wrapped = wrappedIdsRef.current.has(mk.id)
            const noTransition = instantUpdate || wrapped || !seen
            return (
              <g
                key={mk.id}
                transform={`translate(${mk.x} ${mk.y})`}
                style={{ transition: noTransition ? 'none' : 'transform 1s linear' }}
              >
                <circle r="10" fill={mk.color} opacity="0.18" />
                <circle r="5.5" fill={mk.color} stroke="var(--bg)" strokeWidth="2" />
                {mk.label && (
                  <text x="11" y="-8" fill="var(--text)" fontSize="10" fontWeight="700"
                        style={{ paintOrder: 'stroke', stroke: 'var(--bg)', strokeWidth: 3, strokeLinejoin: 'round' }}>
                    {mk.label}
                  </text>
                )}
                {mk.subLabel && (
                  <text x="11" y="5" fill="var(--text-2)" fontSize="9" fontWeight="600"
                        style={{ paintOrder: 'stroke', stroke: 'var(--bg)', strokeWidth: 2.5, strokeLinejoin: 'round' }}>
                    {mk.subLabel}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      </svg>
      {showLabel && lapDistanceM != null && (
        <div className="map-meta">{lapDistanceM} m / tour · 56 pts GPX</div>
      )}
    </div>
  )
}