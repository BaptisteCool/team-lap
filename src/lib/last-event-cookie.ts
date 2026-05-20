const COOKIE_NAME = 'last-event-slug'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 jours en secondes

export function setLastEventSlug(slug: string): void {
  try {
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(slug)}; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax`
  } catch (_) {}
}

export function getLastEventSlug(): string | null {
  try {
    const match = document.cookie
      .split('; ')
      .find((row) => row.startsWith(`${COOKIE_NAME}=`))
    if (!match) return null
    return decodeURIComponent(match.split('=')[1])
  } catch (_) {
    return null
  }
}
