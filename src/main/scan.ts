import { runFfmpeg, type FfmpegRun } from './ffmpeg'
import { resolveInput } from './export'
import type { PreviewSource, ScanResult } from '../shared/types'
import { plainReason, videoReason } from '../shared/userError'

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

interface ScanState {
  run: FfmpegRun | null
  cancelled: boolean
}

let currentScan: ScanState | null = null

/** Cancel an in-progress scan, if any. */
export function cancelScan(): void {
  if (currentScan) {
    currentScan.cancelled = true
    currentScan.run?.kill()
    currentScan = null
  }
}

/**
 * Scan a program for black frames and return candidate episode split points.
 * Decodes the whole program (no encoding) so it's slow but progress is
 * reported. One scan at a time: a new scan cancels the old one.
 * Cancellable via cancelScan(); a cancelled scan returns what it found so far.
 */
export async function scanBlackFrames(
  source: PreviewSource,
  minBlackSec: number,
  onProgress: (fraction: number) => void
): Promise<ScanResult> {
  cancelScan()
  // Registered before any await, so a cancel during setup is not lost.
  const scan: ScanState = { run: null, cancelled: false }
  currentScan = scan
  let cleanup = async (): Promise<void> => undefined
  try {
    const resolved = await resolveInput(source)
    cleanup = resolved.cleanup
    const args = [
      '-hide_banner',
      '-progress',
      'pipe:1',
      '-nostats',
      ...resolved.inputArgs,
      '-i',
      resolved.input,
      '-vf',
      `blackdetect=d=${minBlackSec}:pic_th=0.98`,
      '-an',
      '-sn',
      '-f',
      'null',
      '-'
    ]
    if (scan.cancelled) return { ok: true, splits: [], cancelled: true }
    const run = runFfmpeg(args, (t) => {
      if (source.durationSec > 0) onProgress(Math.min(1, t / source.durationSec))
    })
    scan.run = run
    const { code, stderr } = await run.done
    const splits = candidateSplitsFromBlack(parseBlackIntervals(stderr), source.durationSec)
    if (scan.cancelled) return { ok: true, splits, cancelled: true }
    if (code !== 0) return { ok: false, error: videoReason(stderr) }
    return { ok: true, splits, cancelled: false }
  } catch (e) {
    return { ok: false, error: plainReason(e) }
  } finally {
    if (currentScan === scan) currentScan = null
    // The temp concat list is disposable: a failed delete must not turn the
    // scan result into a rejection (the UI would stay in "Scanning…").
    await cleanup().catch(() => undefined)
  }
}
