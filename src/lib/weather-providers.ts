// Weather provider registry — declares both implemented and placeholder sources.
// Implemented sources have a Convex action backing them; placeholders are shown
// disabled in the UI until configuration (API key, etc.) is provided.

export type ProviderId = 'met-no' | 'meteo-france' | 'weather-api'

export interface ProviderInfo {
  id: ProviderId
  label: string
  configured: boolean // true if backend can fetch this source
  notConfiguredHint?: string // shown as tooltip when configured === false
}

// Note: Open-Meteo retiré (données peu fiables France). Met.no = source de référence.
export const PROVIDERS: ProviderInfo[] = [
  { id: 'met-no', label: 'Met.no (Norvège)', configured: true },
  {
    id: 'meteo-france',
    label: 'Météo France',
    configured: false,
    notConfiguredHint: "Configuration requise par l'administrateur (clé API PortailAPI Météo France)",
  },
  {
    id: 'weather-api',
    label: 'WeatherAPI.com',
    configured: false,
    notConfiguredHint: "Configuration requise par l'administrateur (clé API WeatherAPI.com)",
  },
]

export const DEFAULT_PROVIDER: ProviderId = 'met-no'

const STORAGE_KEY = 'teamlap.weather.preferredProvider'

// Returns the current preferred provider (validated against PROVIDERS registry, configured only).
export function readPreferredProvider(): ProviderId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PROVIDER
    const found = PROVIDERS.find((p) => p.id === raw && p.configured)
    return found ? found.id : DEFAULT_PROVIDER
  } catch (_) {
    return DEFAULT_PROVIDER
  }
}

// Persists choice — silently no-op when localStorage is unavailable (private mode strict).
export function writePreferredProvider(provider: ProviderId): { persisted: boolean } {
  try {
    localStorage.setItem(STORAGE_KEY, provider)
    return { persisted: true }
  } catch (_) {
    return { persisted: false }
  }
}
