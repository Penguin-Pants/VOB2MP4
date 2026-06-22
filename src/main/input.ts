import type { VobGroup } from '../shared/types'

/** Basename helper that works regardless of platform separators. */
export function basename(p: string): string {
  const norm = p.replace(/\\/g, '/')
  const idx = norm.lastIndexOf('/')
  return idx >= 0 ? norm.slice(idx + 1) : norm
}

/**
 * Parse a DVD VOB filename of the form `VTS_<set>_<part>.VOB`.
 * Returns the title-set id and the part number, or null if it doesn't match.
 * Part 0 is the menu/navigation VOB (not episode video).
 */
export function parseVobName(name: string): { set: string; part: number } | null {
  const m = /^VTS_(\d+)_(\d+)\.VOB$/i.exec(basename(name))
  if (!m) return null
  return { set: m[1], part: Number.parseInt(m[2], 10) }
}

/** Natural-order comparison so "part2" sorts before "part10". */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

/** Lower-cased file extension without the dot (e.g. "m4v"), or "". */
export function extOf(name: string): string {
  const base = basename(name)
  const idx = base.lastIndexOf('.')
  return idx >= 0 ? base.slice(idx + 1).toLowerCase() : ''
}

/** Single-file video containers handled as one-program-per-file (not joined). */
export const MEDIA_EXTENSIONS = new Set([
  'm4v',
  'mp4',
  'mkv',
  'mov',
  'avi',
  'm2ts',
  'mts',
  'ts',
  'mpg',
  'mpeg',
  'wmv',
  'webm'
])

export function isVobFile(name: string): boolean {
  return extOf(name) === 'vob'
}

export function isMediaFile(name: string): boolean {
  return MEDIA_EXTENSIONS.has(extOf(name))
}

/** Strip the extension from a basename, for use as a default label/show name. */
export function stripExt(name: string): string {
  const base = basename(name)
  const idx = base.lastIndexOf('.')
  return idx > 0 ? base.slice(0, idx) : base
}

/**
 * Group standalone media files (.m4v, .mp4, …). Each file is its own program
 * (one disc per file), unlike VOB parts which are joined.
 */
export function groupMediaFiles(paths: string[]): VobGroup[] {
  return [...paths].sort(naturalCompare).map((p) => ({
    id: `media:${basename(p)}`,
    label: stripExt(p),
    files: [p]
  }))
}

/**
 * Whether a directory's entry names look like a DVD video structure
 * (contains a VIDEO_TS folder, or DVD .IFO/.VOB files directly).
 */
export function looksLikeVideoTs(entryNames: string[]): boolean {
  const lower = entryNames.map((e) => e.toLowerCase())
  if (lower.includes('video_ts')) return true
  const hasIfo = lower.some((e) => e.endsWith('.ifo'))
  const hasDvdVob = lower.some((e) => /^vts_\d+_\d+\.vob$/.test(e) || e === 'video_ts.vob')
  return hasIfo || hasDvdVob
}

/**
 * Group loose VOB file paths into programs.
 *
 * - Files named `VTS_<set>_<part>.VOB` are grouped by their set, ordered by
 *   part. The menu VOB (part 0) is excluded from the joined program.
 * - Any other selected files are combined into one natural-sorted group,
 *   since the user selected them together as a single program.
 */
export function groupVobFiles(paths: string[]): VobGroup[] {
  const sets = new Map<string, Array<{ path: string; part: number }>>()
  const others: string[] = []

  for (const p of paths) {
    const parsed = parseVobName(p)
    if (parsed) {
      const list = sets.get(parsed.set) ?? []
      list.push({ path: p, part: parsed.part })
      sets.set(parsed.set, list)
    } else {
      others.push(p)
    }
  }

  const groups: VobGroup[] = []

  for (const [set, items] of [...sets.entries()].sort((a, b) => naturalCompare(a[0], b[0]))) {
    const ordered = items.sort((a, b) => a.part - b.part)
    const videoParts = ordered.filter((it) => it.part >= 1)
    // If a set somehow only had a menu VOB (part 0), fall back to using it.
    const chosen = (videoParts.length > 0 ? videoParts : ordered).map((it) => it.path)
    groups.push({
      id: `VTS_${set}`,
      label: `Title set VTS_${set} (${chosen.length} file${chosen.length === 1 ? '' : 's'})`,
      files: chosen
    })
  }

  if (others.length > 0) {
    const ordered = [...others].sort(naturalCompare)
    groups.push({
      id: 'selected',
      label: `Selected files (${ordered.length})`,
      files: ordered
    })
  }

  return groups
}
