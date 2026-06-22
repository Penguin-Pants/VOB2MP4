import { spawn, type ChildProcess } from 'child_process'
import { binaryPath } from './ffmpeg'
import { resolveInput } from './export'
import type { PreviewSource } from '../shared/types'

export interface BlackInterval {
  start: number
  end: number
}

/** Parse ffmpeg blackdetect log lines into intervals. Pure / testable. */
export function parseBlackIntervals(text: string): BlackInterval[] {
  const out: BlackInterval[] = []
  const re = /black_start:(\d+(?:\.\d+)?)\s+black_end:(\d+(?:\.\d+)?)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    out.push({ start: Number(m[1]), end: Number(m[2]) })
  }
  return out
}

/**
 * Convert black intervals into candidate split points (midpoint of each black
 * run), dropping any at the very start/end. Pure / testable.
 */
export function candidateSplitsFromBlack(
  intervals: BlackInterval[],
  duration: number,
  edgeGuardSec = 2
): number[] {
  return intervals
    .map((b) => (b.start + b.end) / 2)
    .filter((t) => t > edgeGuardSec && t < duration - edgeGuardSec)
}

/** Parse an ffmpeg `-progress` out_time line into seconds. */
function parseOutTime(line: string): number | null {
  const m = /out_time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(line)
  if (!m) return null
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
}

let currentScan: ChildProcess | null = null

/** Cancel an in-progress scan, if any. */
export function cancelScan(): void {
  if (currentScan) {
    currentScan.kill()
    currentScan = null
  }
}

/**
 * Scan a program for black frames and return candidate episode split points.
 * Decodes the whole program (no encoding) so it's slow but progress is
 * reported. Cancellable via cancelScan(); returns whatever was found so far.
 */
export async function scanBlackFrames(
  source: PreviewSource,
  minBlackSec: number,
  onProgress: (fraction: number) => void
): Promise<number[]> {
  const { inputArgs, input, cleanup } = await resolveInput(source)
  const args = [
    '-hide_banner',
    '-progress',
    'pipe:1',
    '-nostats',
    ...inputArgs,
    '-i',
    input,
    '-vf',
    `blackdetect=d=${minBlackSec}:pic_th=0.98`,
    '-an',
    '-sn',
    '-f',
    'null',
    '-'
  ]

  return new Promise<number[]>((resolve) => {
    const proc = spawn(binaryPath('ffmpeg'), args)
    currentScan = proc
    let stderr = ''
    let stdout = ''
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString()
    })
    proc.stdout.on('data', (d: Buffer) => {
      stdout += d.toString()
      let nl: number
      while ((nl = stdout.indexOf('\n')) >= 0) {
        const line = stdout.slice(0, nl)
        stdout = stdout.slice(nl + 1)
        const t = parseOutTime(line)
        if (t != null && source.durationSec > 0) onProgress(Math.min(1, t / source.durationSec))
      }
    })
    const finish = (): void => {
      currentScan = null
      void cleanup()
      resolve(candidateSplitsFromBlack(parseBlackIntervals(stderr), source.durationSec))
    }
    proc.on('error', finish)
    proc.on('close', finish)
  })
}
