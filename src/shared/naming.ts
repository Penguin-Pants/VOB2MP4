import type { NamingOptions } from './types'

// Characters not allowed in Windows filenames. Spaces and hyphens are kept.
const ILLEGAL = /[<>:"/\\|?*]/g

/** Strip characters that are invalid in Windows filenames and tidy spacing. */
export function sanitizeFilename(name: string): string {
  return name
    .replace(ILLEGAL, '')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '') // no trailing dots/spaces
    .trim()
}

function pad2(n: number): string {
  return String(Math.max(0, Math.trunc(n))).padStart(2, '0')
}

/** "Season 01" folder name for the chosen season. */
export function seasonFolderName(season: number): string {
  return `Season ${pad2(season)}`
}

/**
 * Plex/Jellyfin episode filename, e.g. "Show Name - S01E03.mp4".
 * `episodeIndex` is 0-based within the export; the actual number is
 * startEpisode + episodeIndex.
 */
export function episodeFileName(naming: NamingOptions, episodeIndex: number): string {
  const epNum = naming.startEpisode + episodeIndex
  const show = sanitizeFilename(naming.showName) || 'Show'
  return `${show} - S${pad2(naming.season)}E${pad2(epNum)}.mp4`
}

/** First episode number after exporting `episodeCount` from `startEpisode`. */
export function nextStartEpisode(startEpisode: number, episodeCount: number): number {
  return startEpisode + episodeCount
}
