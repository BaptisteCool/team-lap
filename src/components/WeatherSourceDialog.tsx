import { useEffect, useState } from 'react'
import { useAction, useQuery } from '../convex/hooks'
import { wmoToInfo } from '../lib/weather-codes'
import { PROVIDERS, type ProviderId } from '../lib/weather-providers'
import type { HourlyForecast } from './WeatherSummaryBanner'

interface WeatherSourceDialogProps {
  open: boolean
  onClose: () => void
  eventId: string | null
  currentProvider: ProviderId
  onSelect: (id: ProviderId) => void
}

// Picks the index of the hourly forecast slot closest to "now".
function nowIndex(forecast: HourlyForecast | null | undefined): number | null {
  if (!forecast?.time?.length) return null
  const now = Date.now()
  let best = -1
  let bestDelta = Infinity
  for (let i = 0; i < forecast.time.length; i++) {
    const d = Math.abs(forecast.time[i] - now)
    if (d < bestDelta) {
      bestDelta = d
      best = i
    }
  }
  return best >= 0 ? best : null
}

function ProviderRow({
  id,
  label,
  configured,
  notConfiguredHint,
  forecast,
  loading,
  isCurrent,
  selected,
  onSelect,
}: {
  id: ProviderId
  label: string
  configured: boolean
  notConfiguredHint?: string
  forecast: HourlyForecast | null
  loading: boolean
  isCurrent: boolean
  selected: boolean
  onSelect: () => void
}) {
  const i = forecast ? nowIndex(forecast) : null
  const tempStr = forecast && i != null ? `${Math.round(forecast.temperature_2m[i])}°C` : '—'
  const info = forecast && i != null ? wmoToInfo(forecast.weather_code[i]) : null
  const humidityStr = forecast && i != null ? `${Math.round(forecast.relative_humidity_2m[i])}%` : '—'
  const precipStr = forecast && i != null ? `${Math.round(forecast.precipitation_probability[i])}%` : '—'
  return (
    <label
      title={!configured ? notConfiguredHint : undefined}
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        gap: 10,
        alignItems: 'center',
        padding: '10px 12px',
        borderRadius: 8,
        background: selected ? 'oklch(0.86 0.20 135 / 0.10)' : 'var(--bg-2)',
        border: '1px solid ' + (selected ? 'oklch(0.86 0.20 135 / 0.4)' : 'var(--border)'),
        opacity: configured ? 1 : 0.55,
        cursor: configured ? 'pointer' : 'not-allowed',
      }}
    >
      <input
        type="radio"
        name="weather-provider"
        value={id}
        checked={selected}
        disabled={!configured}
        onChange={onSelect}
      />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{label}</span>
          {isCurrent && (
            <span
              className="badge accent"
              style={{ fontSize: 10, padding: '1px 6px' }}
              title="Source actuellement utilisée"
            >
              Actuel
            </span>
          )}
          {!configured && (
            <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
              (non configuré)
            </span>
          )}
        </div>
        {configured && (
          <div className="mono" style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>
            {loading ? (
              'chargement…'
            ) : forecast && i != null ? (
              <>
                {info?.emoji} {tempStr} · hum. {humidityStr} · pluie {precipStr}
              </>
            ) : (
              <span style={{ color: 'var(--muted)' }}>Données indisponibles</span>
            )}
          </div>
        )}
      </div>
    </label>
  )
}

export function WeatherSourceDialog({
  open,
  onClose,
  eventId,
  currentProvider,
  onSelect,
}: WeatherSourceDialogProps) {
  const [selected, setSelected] = useState<ProviderId>(currentProvider)
  const fetchWeather = useAction('weather:fetchWeather' as any)
  // Reset selection when dialog re-opens.
  useEffect(() => {
    if (open) setSelected(currentProvider)
  }, [open, currentProvider])

  // Pre-fetch both supported providers when dialog opens (no-op if cache fresh).
  useEffect(() => {
    if (!open || !eventId) return
    for (const p of PROVIDERS.filter((x) => x.configured)) {
      fetchWeather({ eventId, provider: p.id }).catch(() => {
        /* swallow — UI shows "Données indisponibles" */
      })
    }
  }, [open, eventId])

  const openMeteoCache = useQuery(
    'weather:getWeatherForEvent' as any,
    open && eventId ? { eventId, provider: 'open-meteo' } : 'skip',
  ) as any
  const metNoCache = useQuery(
    'weather:getWeatherForEvent' as any,
    open && eventId ? { eventId, provider: 'met-no' } : 'skip',
  ) as any

  if (!open) return null

  const cacheByProvider: Record<string, any> = {
    'open-meteo': openMeteoCache,
    'met-no': metNoCache,
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="modal-head">
          <h3>Choisir la source météo</h3>
          <button
            className="btn ghost icon"
            style={{ marginLeft: 'auto' }}
            onClick={onClose}
            title="Fermer"
          >
            ✕
          </button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gap: 8 }}>
          <div className="hint" style={{ fontSize: 12 }}>
            Choisissez la source qui correspond le mieux à votre région. Le choix est mémorisé par
            navigateur.
          </div>
          {PROVIDERS.map((p) => {
            const cache = cacheByProvider[p.id]
            const forecast = cache?.data || null
            // For configured providers we initially have undefined (loading), then null/data.
            const loading = p.configured && cache === undefined
            return (
              <ProviderRow
                key={p.id}
                id={p.id}
                label={p.label}
                configured={p.configured}
                notConfiguredHint={p.notConfiguredHint}
                forecast={forecast}
                loading={loading}
                isCurrent={p.id === currentProvider}
                selected={selected === p.id}
                onSelect={() => setSelected(p.id)}
              />
            )
          })}
        </div>
        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>
            Annuler
          </button>
          <button
            className="btn primary"
            disabled={selected === currentProvider}
            onClick={() => {
              onSelect(selected)
              onClose()
            }}
          >
            ✓ Définir comme source
          </button>
        </div>
      </div>
    </div>
  )
}
