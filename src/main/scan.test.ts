import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { execFileSync } from 'child_process'
import { cancelScan, candidateSplitsFromBlack, parseBlackIntervals, scanBlackFrames } from './scan'
import { binariesPresent, binaryPath } from './ffmpeg'
import type { PreviewSource } from '../shared/types'

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

const needsFfmpeg = { skip: !binariesPresent() && 'ffmpeg not fetched (npm run fetch-ffmpeg)' }

function fileSource(file: string, durationSec: number): PreviewSource {
  return {
    kind: 'files',
    label: 'clip',
    durationSec,
    frameRate: 25,
    streams: [],
    files: [file],
    fileDurations: [durationSec]
  }
}

/** 3 s picture, 1 s black, 3 s picture. */
async function withBlackBreakClip(fn: (source: PreviewSource) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'vob2mp4-test-'))
  try {
    const file = join(dir, 'clip.mkv')
    execFileSync(binaryPath('ffmpeg'), [
      '-v', 'error',
      '-f', 'lavfi', '-i', 'testsrc=d=3:s=160x120:r=25',
      '-f', 'lavfi', '-i', 'color=black:d=1:s=160x120:r=25',
      '-f', 'lavfi', '-i', 'testsrc=d=3:s=160x120:r=25',
      '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1[v]', '-map', '[v]',
      '-c:v', 'ffv1', file
    ])
    await fn(fileSource(file, 7))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('scanBlackFrames finds the black break', needsFfmpeg, async () => {
  await withBlackBreakClip(async (source) => {
    const res = await scanBlackFrames(source, 0.4, () => undefined)
    assert.equal(res.ok, true)
    if (!res.ok) return
    assert.equal(res.cancelled, false)
    assert.equal(res.splits.length, 1)
    assert.ok(Math.abs(res.splits[0] - 3.5) < 0.2)
  })
})

test('scanBlackFrames reports an ffmpeg failure instead of "no breaks"', needsFfmpeg, async () => {
  const res = await scanBlackFrames(fileSource(join(tmpdir(), 'vob2mp4-missing.mkv'), 7), 0.4, () => undefined)
  assert.equal(res.ok, false)
  if (res.ok) return
  assert.ok(res.error.length > 0)
})

test('scanBlackFrames reports a cancelled scan', needsFfmpeg, async () => {
  await withBlackBreakClip(async (source) => {
    const pending = scanBlackFrames(source, 0.4, () => undefined)
    cancelScan()
    const res = await pending
    assert.equal(res.ok, true)
    if (!res.ok) return
    assert.equal(res.cancelled, true)
  })
})
