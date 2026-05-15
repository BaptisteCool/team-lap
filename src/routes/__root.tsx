import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '../convex/hooks'
import { fmtClock } from '../lib/utils'
import { UpdateBanner } from '../components/UpdateBanner'

const EVENT_SLUG = '24h-brette-les-pins-2026'

// Env detection from hostname — distingue localhost / preview Vercel / prod
function detectEnv(): { label: string; tag: string | null; color: string } {
  if (typeof window === 'undefined') return { label: 'TeamLap', tag: null, color: 'inherit' }
  const h = window.location.hostname
  if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.local')) {
    return { label: 'TeamLap', tag: 'LOCAL', color: 'oklch(0.65 0.18 270)' }
  }
  // Vercel preview deploys: *-baptiste-cools-projects.vercel.app (any subdomain except prod alias)
  if (h.includes('vercel.app')) {
    return { label: 'TeamLap', tag: 'PREVIEW', color: 'oklch(0.82 0.17 70)' }
  }
  return { label: 'TeamLap', tag: null, color: 'inherit' }
}

export const Route = createRootRoute({
  component: () => {
    const env = detectEnv()
    // Update document title with env tag (visible in tab + history)
    useEffect(() => {
      document.title = env.tag ? `[${env.tag}] TeamLap · Relais 24h` : 'TeamLap · Relais 24h'
    }, [env.tag])
    // PWA manifest swap per env via static files (Blob URL casse install browsers).
    // Pré-requis: public/manifest-local.json + public/manifest-preview.json doivent exister.
    useEffect(() => {
      if (!env.tag) return // prod = use static /manifest.json
      const link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null
      if (!link) return
      const prevHref = link.href
      link.href = env.tag === 'LOCAL' ? '/manifest-local.json' : '/manifest-preview.json'
      // Update theme-color meta pour distinguer install
      const themeMeta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
      const prevTheme = themeMeta?.content
      const themeColor = env.tag === 'LOCAL' ? '#9580FF' : '#F0C040'
      if (themeMeta) themeMeta.content = themeColor
      return () => {
        if (link && prevHref) link.href = prevHref
        if (themeMeta && prevTheme) themeMeta.content = prevTheme
      }
    }, [env.tag])
    const event = useQuery('events:getBySlug' as any, { slug: EVENT_SLUG }) as any
    const [now, setNow] = useState(Date.now())
    useEffect(() => {
      const id = setInterval(() => setNow(Date.now()), 1000)
      return () => clearInterval(id)
    }, [])

    const status = event?.status as string | undefined
    const raceStarted = status === 'running'
    const raceFinished = status === 'finished' || event?.actualEnd
    const racePaused = status === 'paused'
    const raceStartTime: number | null = event?.actualStart || null
    const RACE_MS = (event?.raceDuration as number) || 24 * 3600 * 1000
    const scheduledStartMs = (event?.scheduledStart as number) || null

    const elapsed = raceStartTime ? Math.max(0, Math.min(now - raceStartTime, RACE_MS)) : 0
    const remaining = raceStartTime ? Math.max(0, RACE_MS - elapsed) : RACE_MS
    const tilStart = scheduledStartMs ? scheduledStartMs - now : null

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
              <div className="brand-text">
                <div className="brand-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  TeamLap
                  {env.tag && (
                    <span
                      style={{
                        fontSize: 10,
                        padding: '1px 6px',
                        borderRadius: 4,
                        color: env.color,
                        border: `1px solid ${env.color}`,
                        fontWeight: 700,
                        letterSpacing: '0.5px',
                      }}
                    >
                      {env.tag}
                    </span>
                  )}
                </div>
                <div className="brand-sub">Relais 24h</div>
              </div>
            </Link>
          </div>
          
          <div className="topbar-spacer" />
          
          <Link to="/" className="btn ghost hide-on-mobile">
            Accueil
          </Link>
          
          <div className={`live-pill ${raceStarted ? 'is-live' : ''}`}>
            <span className="live-dot"></span>
            {raceFinished ? (
              <span className="mono" style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span>🏁</span>
                <span>Terminée</span>
                {raceStartTime && <span>{fmtClock(elapsed)}</span>}
              </span>
            ) : racePaused && raceStartTime ? (
              <span className="mono" style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span>⏸</span>
                <span>PAUSE</span>
                <span>{fmtClock(elapsed)}</span>
              </span>
            ) : raceStarted && raceStartTime ? (
              <span className="mono" style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span>LIVE</span>
                <span>{fmtClock(elapsed)}</span>
                <span style={{ color: 'var(--muted)' }}>·</span>
                <span style={{ color: 'var(--text-2)' }}>−{fmtClock(remaining)}</span>
              </span>
            ) : tilStart != null && tilStart > 0 ? (
              <span className="mono" style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span>Départ dans</span>
                <span>{fmtClock(tilStart)}</span>
              </span>
            ) : (
              <span>Stand‑by</span>
            )}
          </div>
        </header>
        <main>
          <Outlet />
        </main>
        <UpdateBanner />
      </div>
    )
  },
})
