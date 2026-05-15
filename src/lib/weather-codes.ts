// WMO Weather interpretation codes (Open-Meteo)
// https://open-meteo.com/en/docs#weathervariables
// Returns short label + emoji icon. Unknown codes fall back to neutral '?'.

export interface WeatherInfo {
  emoji: string
  label: string
}

const MAP: Record<number, WeatherInfo> = {
  0: { emoji: '☀️', label: 'Ciel clair' },
  1: { emoji: '🌤', label: 'Peu nuageux' },
  2: { emoji: '⛅', label: 'Partiellement nuageux' },
  3: { emoji: '☁️', label: 'Couvert' },
  45: { emoji: '🌫', label: 'Brouillard' },
  48: { emoji: '🌫', label: 'Brouillard givrant' },
  51: { emoji: '🌦', label: 'Bruine légère' },
  53: { emoji: '🌦', label: 'Bruine modérée' },
  55: { emoji: '🌧', label: 'Bruine dense' },
  56: { emoji: '🌧', label: 'Bruine verglaçante' },
  57: { emoji: '🌧', label: 'Bruine verglaçante dense' },
  61: { emoji: '🌧', label: 'Pluie faible' },
  63: { emoji: '🌧', label: 'Pluie modérée' },
  65: { emoji: '🌧', label: 'Pluie forte' },
  66: { emoji: '🌧', label: 'Pluie verglaçante' },
  67: { emoji: '🌧', label: 'Pluie verglaçante forte' },
  71: { emoji: '🌨', label: 'Neige faible' },
  73: { emoji: '🌨', label: 'Neige modérée' },
  75: { emoji: '❄️', label: 'Neige forte' },
  77: { emoji: '❄️', label: 'Grains de neige' },
  80: { emoji: '🌧', label: 'Averses faibles' },
  81: { emoji: '🌧', label: 'Averses modérées' },
  82: { emoji: '⛈', label: 'Averses violentes' },
  85: { emoji: '🌨', label: 'Averses neige faibles' },
  86: { emoji: '🌨', label: 'Averses neige fortes' },
  95: { emoji: '⛈', label: 'Orage' },
  96: { emoji: '⛈', label: 'Orage avec grêle' },
  99: { emoji: '⛈', label: 'Orage avec grêle violente' },
}

export function wmoToInfo(code: number | null | undefined): WeatherInfo {
  if (code == null || !(code in MAP)) return { emoji: '❓', label: 'Conditions inconnues' }
  return MAP[code]
}

// True for codes that warrant a strategy alert (rain, snow, thunderstorm).
export function isNotableWeather(code: number | null | undefined): boolean {
  if (code == null) return false
  return code >= 51 // bruine et au-delà
}
