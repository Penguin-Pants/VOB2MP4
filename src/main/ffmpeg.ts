import { app } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { execFile, spawn, type ChildProcess } from 'child_process'
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

/** Parse an ffmpeg `-progress` line (`out_time=HH:MM:SS.micros`) into seconds. */
export function parseOutTime(line: string): number | null {
  const m = /out_time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(line)
  if (!m) return null
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
}

export interface FfmpegOutput {
  code: number | null
  /** Collected stdout (empty when progress lines were parsed instead). */
  stdout: Buffer
  stderr: string
}

export interface FfmpegRun {
  /** Settles when the process exits; rejects only if it cannot start. */
  done: Promise<FfmpegOutput>
  kill: () => void
}

const liveProcesses = new Set<ChildProcess>()

/**
 * Spawn the bundled ffmpeg. With `onProgressSec`, stdout is read as
 * `-progress pipe:1` lines; otherwise stdout is collected (e.g. a JPEG).
 */
export function runFfmpeg(args: string[], onProgressSec?: (sec: number) => void): FfmpegRun {
  const proc = spawn(binaryPath('ffmpeg'), args)
  liveProcesses.add(proc)
  const out: Buffer[] = []
  const err: Buffer[] = []
  let pending = ''
  proc.stdout.on('data', (d: Buffer) => {
    if (!onProgressSec) {
      out.push(d)
      return
    }
    pending += d.toString()
    let nl: number
    while ((nl = pending.indexOf('\n')) >= 0) {
      const t = parseOutTime(pending.slice(0, nl))
      pending = pending.slice(nl + 1)
      if (t == null) continue
      try {
        onProgressSec(t)
      } catch {
        // A failing listener (e.g. a closed window) must not crash the main process.
      }
    }
  })
  proc.stderr.on('data', (d: Buffer) => err.push(d))
  const done = new Promise<FfmpegOutput>((resolve, reject) => {
    proc.on('error', (e) => {
      liveProcesses.delete(proc)
      reject(e)
    })
    proc.on('close', (code) => {
      liveProcesses.delete(proc)
      resolve({ code, stdout: Buffer.concat(out), stderr: Buffer.concat(err).toString() })
    })
  })
  return { done, kill: () => void proc.kill() }
}

/** Kill every running ffmpeg (on app quit, so none keep running orphaned). */
export function killAllFfmpeg(): void {
  for (const proc of liveProcesses) proc.kill()
}
