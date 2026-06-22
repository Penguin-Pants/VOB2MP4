import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import type { AppSettings, LastExportSettings, SettingsPatch } from '../shared/types'

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
