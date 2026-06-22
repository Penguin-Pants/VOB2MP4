import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeSplitPoints,
  segmentsFromSplits,
  clampSplitMove
} from '../shared/segments'

test('normalizeSplitPoints sorts, bounds, and de-dupes by min gap', () => {
  // duration 100, minGap 1: drop <=1 and >=99, sort, drop near-duplicates
  assert.deepEqual(normalizeSplitPoints([50, 10, 10.5, 99.5, 0.2], 100, 1), [10, 50])
  assert.deepEqual(normalizeSplitPoints([30, 31, 32], 100, 1), [30, 31, 32])
  assert.deepEqual(normalizeSplitPoints([], 100), [])
})

test('segmentsFromSplits builds contiguous episodes covering the program', () => {
  const segs = segmentsFromSplits([1325, 2650], 3975, 1)
  assert.equal(segs.length, 3)
  assert.deepEqual(segs[0], { index: 0, startSec: 0, endSec: 1325 })
  assert.deepEqual(segs[1], { index: 1, startSec: 1325, endSec: 2650 })
  assert.deepEqual(segs[2], { index: 2, startSec: 2650, endSec: 3975 })
})

test('segmentsFromSplits with no splits yields a single full segment', () => {
  assert.deepEqual(segmentsFromSplits([], 1000), [{ index: 0, startSec: 0, endSec: 1000 }])
})

test('segmentsFromSplits returns nothing for zero/invalid duration', () => {
  assert.deepEqual(segmentsFromSplits([10], 0), [])
})

test('clampSplitMove keeps a split between its neighbours', () => {
  const splits = [100, 200, 300]
  // move middle split; cannot cross neighbours (min gap 1)
  assert.equal(clampSplitMove(splits, 1, 250, 1000, 1), 250)
  assert.equal(clampSplitMove(splits, 1, 50, 1000, 1), 101) // clamped to prev+gap
  assert.equal(clampSplitMove(splits, 1, 999, 1000, 1), 299) // clamped to next-gap
  // first split clamps against 0 + gap
  assert.equal(clampSplitMove(splits, 0, -5, 1000, 1), 1)
})
