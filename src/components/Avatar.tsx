
interface AvatarProps {
  name: string
  color?: string
  size?: number
}

export function Avatar({ name, color, size = 56 }: AvatarProps) {
  const initials = (name || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div
      className="avatar"
      style={{ width: size, height: size, background: color || 'var(--accent)', fontSize: size * 0.36 }}
    >
      {initials}
    </div>
  )
}