import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mock } from 'node:test'
import { createRequire } from 'module'
import { mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { execFileSync } from 'child_process'
import { parseBlackIntervals, candidateSplitsFromBlack, scanBlackFrames } from './scan'
import { binariesPresent, binaryPath } from './ffmpeg'

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

test(
  'scanBlackFrames still resolves when the temp concat list cannot be deleted',
  { skip: !binariesPresent() && 'ffmpeg not fetched (npm run fetch-ffmpeg)' },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vob2mp4-test-'))
    const fsp = createRequire(__filename)('fs/promises') as typeof import('fs/promises')
    try {
      const files = ['a.mkv', 'b.mkv'].map((name) => {
        const file = join(dir, name)
        execFileSync(binaryPath('ffmpeg'), [
          '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=d=1:s=64x48:r=25', '-c:v', 'ffv1', file
        ])
        return file
      })
      // Deleting the list fails (e.g. a virus scanner holds it on Windows).
      mock.method(fsp, 'rm', async () => {
        throw new Error('EBUSY: resource busy or locked')
      })
      const res = await scanBlackFrames(
        { kind: 'files', label: 'x', durationSec: 2, frameRate: 25, streams: [], files, fileDurations: [1, 1] },
        0.4,
        () => undefined
      )
      assert.ok(Array.isArray(res))
    } finally {
      mock.restoreAll()
      await rm(dir, { recursive: true, force: true })
    }
  }
)
