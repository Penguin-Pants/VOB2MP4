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
  return join(ffmpegDir(), exe)
}

/**
 * Resolve the directory holding the bundled FFmpeg binaries.
 * Order: explicit env override → Electron app paths → cwd fallback (headless).
 * The env override and headless fallback let the engine run outside Electron
 * (e.g. in tests / scripts).
 */
function ffmpegDir(): string {
  if (process.env.VOB2MP4_FFMPEG_DIR) return process.env.VOB2MP4_FFMPEG_DIR
  // `app` is undefined when this module is imported outside an Electron runtime.
  if (app && typeof app.getAppPath === 'function') {
    return app.isPackaged
      ? join(process.resourcesPath, 'ffmpeg')
      : join(app.getAppPath(), 'resources', 'ffmpeg')
  }
  return join(process.cwd(), 'resources', 'ffmpeg')
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
