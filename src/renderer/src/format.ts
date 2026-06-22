/** Format seconds as H:MM:SS (or M:SS under an hour). */
export function formatDuration(totalSec: number | null): string {
  if (totalSec == null || !Number.isFinite(totalSec)) return '—'
  const s = Math.round(totalSec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}

/**
 * Parse a timecode string into seconds. Accepts "ss", "m:ss", "h:mm:ss",
 * each with optional decimals. Returns null if it can't be parsed.
 */
export function parseTimecode(input: string): number | null {
  const text = input.trim()
  if (text === '') return null
  const parts = text.split(':')
  if (parts.some((p) => p === '' || Number.isNaN(Number(p)))) return null
  const nums = parts.map(Number)
  let seconds = 0
  for (const n of nums) seconds = seconds * 60 + n
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null
}

/** Human-readable file size. */
export function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}
