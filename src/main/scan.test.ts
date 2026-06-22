import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseBlackIntervals, candidateSplitsFromBlack } from './scan'

const sampleLog = `
frame=  100 fps=0.0 q=-0.0 size=N/A time=00:00:04.00 bitrate=N/A
[blackdetect @ 0x55] black_start:21.5 black_end:23.0 black_duration:1.5
[blackdetect @ 0x55] black_start:44.2 black_end:45.1 black_duration:0.9
some other line
[blackdetect @ 0x55] black_start:0.0 black_end:0.5 black_duration:0.5
`

test('parseBlackIntervals extracts all black runs', () => {
  const intervals = parseBlackIntervals(sampleLog)
  assert.equal(intervals.length, 3)
  assert.deepEqual(intervals[0], { start: 21.5, end: 23.0 })
  assert.deepEqual(intervals[1], { start: 44.2, end: 45.1 })
})

test('candidateSplitsFromBlack returns midpoints and drops edge runs', () => {
  const intervals = parseBlackIntervals(sampleLog)
  // duration 90s; the 0.0-0.5 run is within the 2s edge guard and is dropped
  const splits = candidateSplitsFromBlack(intervals, 90, 2)
  assert.equal(splits.length, 2)
  assert.ok(Math.abs(splits[0] - 22.25) < 1e-6)
  assert.ok(Math.abs(splits[1] - 44.65) < 1e-6)
})

test('candidateSplitsFromBlack drops runs near the end', () => {
  const splits = candidateSplitsFromBlack([{ start: 89.5, end: 89.9 }], 90, 2)
  assert.deepEqual(splits, [])
})

test('parseBlackIntervals handles empty input', () => {
  assert.deepEqual(parseBlackIntervals(''), [])
})
