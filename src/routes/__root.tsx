import { fmtClock } from '../lib/utils'
import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import React from 'react'

export const Route = createRootRoute({
  component: () => {
    // TODO: Get event status from Convex when data is available
    // const eventStatus = useQuery(api.functions.getEventStatus, { eventId: 'default' as any })
    const raceStarted = false
    const raceStartTime = null
    
    const [tickNow, setTickNow] = React.useState(Date.now())
    
    React.useEffect(() => {
      const id = setInterval(() => setTickNow(Date.now()), 1000)
      return () => clearInterval(id)
    }, [])
    
    const RACE_MS = 24 * 3600 * 1000
    const elapsed = 0
    const remaining = RACE_MS
    
    return (
      <div className="app">
        <header className="topbar">
          <div className="brand" style={{ cursor: 'pointer' }}>
            <Link to="/">
              <div className="brand-mark" aria-label="TeamLap">
                <svg width="22" height="22" viewBox="0 0 200 200" fill="none" aria-hidden="true">
                  <circle cx="100" cy="110" r="60" stroke="currentColor" strokeWidth="22" fill="none"
                          strokeDasharray="305 60" strokeDashoffset="-30" strokeLinecap="round"
                          transform="rotate(-90 100 110)" />
                  <rect x="58" y="32" width="84" height="20" rx="10" fill="currentColor" />
                  <rect x="92" y="18" width="16" height="28" rx="4" fill="currentColor" />
                </svg>
              </div>
              <div>
                <div className="brand-name">TeamLap</div>
                <div className="brand-sub">24h de course à pied 2026</div>
              </div>
            </Link>
          </div>
          
          <div className="topbar-spacer" />
          
          <Link to="/" className="btn ghost">
            Accueil
          </Link>
          
          <div className={`live-pill ${raceStarted ? 'is-live' : ''}`}>
            <span className="live-dot"></span>
            {raceStarted && raceStartTime
              ? (
                  <span className="mono" style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    <span>LIVE</span>
                    <span>{fmtClock(elapsed)}</span>
                    <span style={{ color: 'var(--muted)' }}>·</span>
                    <span style={{ color: 'var(--text-2)' }}>−{fmtClock(remaining)}</span>
                  </span>
                )
              : (
                <span>Stand‑by</span>
              )
            }
          </div>
        </header>
        <main>
          <Outlet />
        </main>
      </div>
    )
  },
})
