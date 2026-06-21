import { app } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileP = promisify(execFile)

/**
 * Resolve the path to a bundled FFmpeg-family binary (ffmpeg / ffprobe).
 *
 * In a packaged app the binaries live under `process.resourcesPath/ffmpeg`
 * (placed there by electron-builder's extraResources). In development they
 * live under `<projectRoot>/resources/ffmpeg` (placed there by
 * `npm run fetch-ffmpeg`).
 */
export function binaryPath(name: 'ffmpeg' | 'ffprobe'): string {
  const exe = process.platform === 'win32' ? `${name}.exe` : name
  const base = app.isPackaged
    ? join(process.resourcesPath, 'ffmpeg')
    : join(app.getAppPath(), 'resources', 'ffmpeg')
  return join(base, exe)
}

/** Whether both bundled binaries are present on disk. */
export function binariesPresent(): boolean {
  return existsSync(binaryPath('ffmpeg')) && existsSync(binaryPath('ffprobe'))
}

/** Return the first line of `ffmpeg -version`, or null if unavailable. */
export async function ffmpegVersion(): Promise<string | null> {
  const path = binaryPath('ffmpeg')
  if (!existsSync(path)) return null
  try {
    const { stdout } = await execFileP(path, ['-version'])
    return stdout.split('\n')[0]?.trim() ?? null
  } catch {
    return null
  }
}
