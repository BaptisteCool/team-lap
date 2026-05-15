import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

// Auto-update banner #20: shown when a new SW (=new app version) is ready.
// User clicks "Recharger" (or auto-reload after AUTO_RELOAD_MS) → updateSW()
// activates the new SW + reloads the page → user sees latest version.
const AUTO_RELOAD_MS = 8000

export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      // Periodic update check (every 60min) when app stays open long
      if (registration) {
        setInterval(() => {
          registration.update().catch(() => {})
        }, 60 * 60 * 1000)
      }
    },
    onRegisterError(err) {
      console.warn('SW register error:', err)
    },
  })

  const [countdown, setCountdown] = useState<number | null>(null)

  // Auto-reload countdown once update is available
  useEffect(() => {
    if (!needRefresh) {
      setCountdown(null)
      return
    }
    setCountdown(Math.ceil(AUTO_RELOAD_MS / 1000))
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c == null) return null
        if (c <= 1) {
          clearInterval(id)
          updateServiceWorker(true).catch(() => {})
          return 0
        }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [needRefresh, updateServiceWorker])

  if (!needRefresh) return null

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        padding: '10px 16px',
        background: 'oklch(0.86 0.20 135 / 0.95)',
        color: '#0a0e0c',
        borderRadius: 10,
        boxShadow: '0 4px 16px oklch(0 0 0 / 0.4)',
        fontSize: 13,
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        maxWidth: '92vw',
      }}
    >
      <span>🔄 Nouvelle mise à jour disponible</span>
      {countdown != null && countdown > 0 && (
        <span style={{ fontSize: 11, opacity: 0.75 }}>
          (rechargement auto dans {countdown}s)
        </span>
      )}
      <button
        onClick={() => updateServiceWorker(true)}
        style={{
          padding: '4px 12px',
          borderRadius: 6,
          background: '#0a0e0c',
          color: 'oklch(0.86 0.20 135)',
          border: 'none',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        Recharger
      </button>
      <button
        onClick={() => setNeedRefresh(false)}
        title="Reporter (sera reproposé au prochain check)"
        style={{
          padding: '4px 8px',
          borderRadius: 6,
          background: 'transparent',
          color: '#0a0e0c',
          border: 'none',
          cursor: 'pointer',
          fontSize: 14,
          opacity: 0.6,
        }}
      >
        ✕
      </button>
    </div>
  )
}
