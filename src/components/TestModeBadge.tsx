interface TestModeBadgeProps {
  testMode?: boolean
}

// Banner full-width destructif → MODE TEST omniprésent (Admin/Live/Home/Planning/History)
// Auto-hides quand testMode === false ou undefined.
export function TestModeBadge({ testMode }: TestModeBadgeProps) {
  if (!testMode) return null
  return (
    <div
      style={{
        padding: '6px 12px',
        marginBottom: 10,
        borderRadius: 6,
        background: 'oklch(0.72 0.21 25 / 0.18)',
        color: 'oklch(0.85 0.18 25)',
        border: '1px solid oklch(0.72 0.21 25 / 0.5)',
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.5px',
        textAlign: 'center',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        justifyContent: 'center',
      }}
      role="status"
      title="Timings raccourcis pour tests (5s minLap, 30s maxLap, 3s replaceAuto, 2s relayTransition)"
    >
      <span>⚠</span>
      <span>MODE TEST · Timings fictifs</span>
      <span>⚠</span>
    </div>
  )
}
