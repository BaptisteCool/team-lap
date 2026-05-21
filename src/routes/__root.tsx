import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useMutation } from '../convex/hooks'
import { UpdateBanner } from '../components/UpdateBanner'

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

          <Link
            to="/demo"
            className="btn ghost"
            style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}
          >
            Démo
          </Link>

          <div className="live-pill">
            <span className="live-dot"></span>
            <span>Stand‑by</span>
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
