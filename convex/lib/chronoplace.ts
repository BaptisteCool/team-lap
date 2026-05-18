// Chronoplace JSON API helpers.
//
// Endpoint pattern (no auth, no cookies required):
//   GET https://www.chronoplace.fr/api/classement_live_endurance-detail/{eventId}/{slug}
//
// Response: array of lap objects (sorted DESC by nb_tours). Schema per item:
//   {
//     id: number,                       // unique → idempotency key
//     nb_tours: number,                 // 1-based lap number
//     temps: string,                    // "HH:MM:SS" lap duration
//     created_at: string,               // ISO 8601 UTC
//     dossard: string,
//     nom_equipe: string,
//     nom_equipe_slug: string,
//     nom_coureur: string,              // often empty if affiche_nom_prenom = false
//     prenom_coureur: string,
//     rang: number,
//     ecart: string,
//     evenement_id: number,
//     ...
//   }

export const CHRONOPLACE_BASE_URL = 'https://www.chronoplace.fr'

export function buildChronoplaceUrl(eventId: number, slug: string): string {
  return `${CHRONOPLACE_BASE_URL}/api/classement_live_endurance-detail/${eventId}/${encodeURIComponent(slug)}`
}

// "HH:MM:SS" → milliseconds. Returns 0 for malformed input (safer than throwing inside a cron).
export function parseChronoplaceTime(t: string): number {
  if (!t || typeof t !== 'string') return 0
  const parts = t.split(':').map((p) => Number.parseInt(p, 10))
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return 0
  const [h, m, s] = parts
  return ((h * 60 + m) * 60 + s) * 1000
}

export interface ChronoplaceLap {
  id: number
  nb_tours: number
  temps: string
  created_at: string
  evenement_id?: number
  nom_equipe_slug?: string
  nom_coureur?: string
  prenom_coureur?: string
}

export function isChronoplaceLapShape(o: unknown): o is ChronoplaceLap {
  if (!o || typeof o !== 'object') return false
  const r = o as Record<string, unknown>
  return (
    typeof r.id === 'number' &&
    typeof r.nb_tours === 'number' &&
    typeof r.temps === 'string' &&
    typeof r.created_at === 'string'
  )
}
