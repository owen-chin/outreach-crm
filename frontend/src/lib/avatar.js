const AVATAR_COLORS = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#7c3aed', '#db2777']

export function avatarColor(name) {
  let h = 0
  for (const c of (name || '')) h = h * 31 + c.charCodeAt(0)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

export function initials(name) {
  const trimmed = (name || '').trim()
  if (!trimmed) return '?'
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
