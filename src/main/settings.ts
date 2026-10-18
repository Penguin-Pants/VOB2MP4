import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { nextStartEpisode } from '../shared/naming'
import type { AppSettings, LastExportSettings, NamingOptions, SettingsPatch } from '../shared/types'

/** Merge a settings patch, deep-merging `lastExport`. Pure. */
export function mergeSettings(current: AppSettings, patch: SettingsPatch): AppSettings {
  return {
    ...current,
    lastExport: patch.lastExport
      ? ({ ...current.lastExport, ...patch.lastExport } as LastExportSettings)
      : current.lastExport
  }
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function getSettings(): AppSettings {
  try {
    return JSON.parse(readFileSync(settingsPath(), 'utf8')) as AppSettings
  } catch {
    return {}
  }
}

export function updateSettings(patch: SettingsPatch): AppSettings {
  const next = mergeSettings(getSettings(), patch)
  try {
    writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf8')
  } catch {
    /* best-effort persistence */
  }
  return next
}

/**
 * The settings patch after a job finished: move the saved start episode past
 * its episodes (same show and season only, never backwards). Pure.
 */
export function afterCompletedExport(
  current: AppSettings,
  naming: NamingOptions,
  episodeCount: number
): SettingsPatch {
  const last = current.lastExport
  if (!last || last.showName !== naming.showName || last.season !== naming.season) return {}
  const next = nextStartEpisode(naming.startEpisode, episodeCount)
  return next > last.startEpisode ? { lastExport: { startEpisode: next } } : {}
}

/** Save the numbers a finished queue job used (see afterCompletedExport). */
export function rememberCompletedExport(naming: NamingOptions, episodeCount: number): void {
  const patch = afterCompletedExport(getSettings(), naming, episodeCount)
  if (patch.lastExport) updateSettings(patch)
}
