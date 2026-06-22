import type { Segment } from './types'

/** Minimum spacing between split points / segment length (seconds). */
export const MIN_SPLIT_GAP_SEC = 1

/**
 * Clean a list of split points: keep only those strictly inside (0, duration),
 * sort ascending, and drop any that are within `minGap` of the previous kept
 * one. Pure / deterministic so it can be unit-tested.
 */
export function normalizeSplitPoints(
  points: number[],
  duration: number,
  minGap: number = MIN_SPLIT_GAP_SEC
): number[] {
  const inRange = points
    .filter((p) => Number.isFinite(p) && p > minGap && p < duration - minGap)
    .sort((a, b) => a - b)
  const out: number[] = []
  for (const p of inRange) {
    if (out.length === 0 || p - out[out.length - 1] >= minGap) out.push(p)
  }
  return out
}

/**
 * Derive the contiguous segments (episodes) that result from a set of split
 * points across a program of the given duration.
 */
export function segmentsFromSplits(
  points: number[],
  duration: number,
  minGap: number = MIN_SPLIT_GAP_SEC
): Segment[] {
  if (!Number.isFinite(duration) || duration <= 0) return []
  const splits = normalizeSplitPoints(points, duration, minGap)
  const boundaries = [0, ...splits, duration]
  const segments: Segment[] = []
  for (let i = 0; i < boundaries.length - 1; i++) {
    segments.push({ index: i, startSec: boundaries[i], endSec: boundaries[i + 1] })
  }
  return segments
}

/**
 * Clamp a proposed new position for the split at `index` so it stays strictly
 * between its neighbours (and the program bounds), keeping order stable while
 * dragging.
 */
export function clampSplitMove(
  splits: number[],
  index: number,
  proposed: number,
  duration: number,
  minGap: number = MIN_SPLIT_GAP_SEC
): number {
  const lower = (index > 0 ? splits[index - 1] : 0) + minGap
  const upper = (index < splits.length - 1 ? splits[index + 1] : duration) - minGap
  return Math.max(lower, Math.min(proposed, upper))
}
