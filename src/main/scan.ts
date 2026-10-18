import { runFfmpeg, type FfmpegRun } from './ffmpeg'
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

let currentScan: FfmpegRun | null = null

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

  const run = runFfmpeg(args, (t) => {
    if (source.durationSec > 0) onProgress(Math.min(1, t / source.durationSec))
  })
  currentScan = run
  try {
    const { stderr } = await run.done
    return candidateSplitsFromBlack(parseBlackIntervals(stderr), source.durationSec)
  } catch {
    return []
  } finally {
    if (currentScan === run) currentScan = null
    await cleanup()
  }
}
