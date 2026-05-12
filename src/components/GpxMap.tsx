import { useEffect, useRef, useState } from 'react'
import { GPX_PATH, GPX_VIEWBOX, LAP_DISTANCE_M } from '../lib/race-data'

interface Marker {
  id: string
  color: string
  progress: number
  label?: string
}

interface GpxMapProps {
  height?: number
  marker?: { x: number; y: number }
  progress?: number
  showLabel?: boolean
  markers?: Marker[]
}

export function GpxMap({ height = 220, marker, progress, showLabel = true, markers }: GpxMapProps) {
  const pathRef = useRef<SVGPathElement>(null)
  const [computedMarker, setComputedMarker] = useState<{ x: number; y: number } | null>(null)
  const [computedMulti, setComputedMulti] = useState<Array<Marker & { x: number; y: number }>>([])

  useEffect(() => {
    if (progress == null || !pathRef.current) {
      setComputedMarker(null)
      return
    }
    const len = pathRef.current.getTotalLength()
    const p = ((progress % 1) + 1) % 1 // wrap into [0,1)
    const pt = pathRef.current.getPointAtLength(len * p)
    setComputedMarker({ x: pt.x, y: pt.y })
  }, [progress])

  useEffect(() => {
    if (!Array.isArray(markers) || !pathRef.current) {
      setComputedMulti([])
      return
    }
    const len = pathRef.current.getTotalLength()
    const computed = markers.map(mk => {
      const p = ((mk.progress % 1) + 1) % 1
      const pt = pathRef.current!.getPointAtLength(len * p)
      return { ...mk, x: pt.x, y: pt.y }
    })
    setComputedMulti(computed)
  }, [markers])

  const m = marker || computedMarker

  return (
    <div className="map-wrap" style={{ height }}>
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
        {m && (
          <g transform={`translate(${m.x} ${m.y})`} style={{ transition: 'transform 240ms linear' }}>
            <circle r="11" fill="var(--warn)" opacity="0.18">
              <animate attributeName="r" values="9;13;9" dur="1.6s" repeatCount="indefinite"/>
              <animate attributeName="opacity" values="0.25;0.05;0.25" dur="1.6s" repeatCount="indefinite"/>
            </circle>
            <circle r="5" fill="var(--warn)" stroke="var(--bg)" strokeWidth="2"/>
          </g>
        )}
        {computedMulti.map(mk => (
          <g key={mk.id} transform={`translate(${mk.x} ${mk.y})`} style={{ transition: 'transform 1s linear' }}>
            <circle r="10" fill={mk.color} opacity="0.18" />
            <circle r="5.5" fill={mk.color} stroke="var(--bg)" strokeWidth="2" />
            {mk.label && (
              <text x="9" y="-7" fill="var(--text)" fontSize="9" fontWeight="600"
                    style={{ paintOrder: 'stroke', stroke: 'var(--bg)', strokeWidth: 3, strokeLinejoin: 'round' }}>
                {mk.label}
              </text>
            )}
          </g>
        ))}
      </svg>
      {showLabel && (
        <div className="map-meta">{LAP_DISTANCE_M} m / tour · 56 pts GPX</div>
      )}
    </div>
  )
}