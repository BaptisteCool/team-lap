import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useMutation } from '../convex/hooks'
import { fmtClock } from '../lib/utils'

export const Route = createRootRoute({
  component: () => {
    // TODO: Get event status from Convex when data is available
    // const eventStatus = useQuery(api.functions.getEventStatus, { eventId: 'default' as any })
    const raceStarted = false
    const raceStartTime = null

    const RACE_MS = 24 * 3600 * 1000
    const elapsed = 0
    const remaining = RACE_MS

    // Client-side cron fallback — local Convex backend doesn't run scheduled crons.
    // Fires immediately on mount + every 5s on every page; server-side debounced (MIN_LAP_GAP_MS=5s).
    const autoTickMutation = useMutation('laps:autoTick' as any)
    useEffect(() => {
      // Immediate first tick so race-start auto-lap doesn't wait up to 5s extra
      autoTickMutation({}).catch((e: any) => console.warn('autoTick failed:', e?.message || e))
      const id = setInterval(() => {
        autoTickMutation({}).catch((e: any) => console.warn('autoTick failed:', e?.message || e))
      }, 5000)
      return () => clearInterval(id)
    }, [autoTickMutation])
    
    return (
      <div className="app">
        <header className="topbar">
          <div className="brand" style={{ cursor: 'pointer' }}>
            <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
              <img
                src="/images/icon.png"
                alt="TeamLap"
                width={36}
                height={36}
                style={{ borderRadius: 8, flexShrink: 0, display: 'block' }}
              />
              <div>
                <div className="brand-name">TeamLap</div>
                <div className="brand-sub">Relais 24h</div>
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
