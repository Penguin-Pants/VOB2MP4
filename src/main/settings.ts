import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import type { AppSettings, DialogFolder, LastExportSettings, SettingsPatch } from '../shared/types'

/** Merge a settings patch, deep-merging `lastExport` and `lastDirs`. Pure. */
export function mergeSettings(current: AppSettings, patch: SettingsPatch): AppSettings {
  return {
    ...current,
    lastExport: patch.lastExport
      ? ({ ...current.lastExport, ...patch.lastExport } as LastExportSettings)
      : current.lastExport,
    lastDirs: patch.lastDirs ? { ...current.lastDirs, ...patch.lastDirs } : current.lastDirs
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

/** The folder a file dialog last used, as its `defaultPath`. */
export function lastDir(kind: DialogFolder): string | undefined {
  return getSettings().lastDirs?.[kind]
}

/** Remember the folder a file dialog used, for the next dialog of that kind. */
export function rememberDir(kind: DialogFolder, dir: string): void {
  updateSettings({ lastDirs: { [kind]: dir } })
}
