import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { execFileSync } from 'child_process'
import { cancelPreview, extractFrame, frameArgs, generateFilmstrip, locateInFiles } from './preview'
import { binariesPresent, binaryPath } from './ffmpeg'
import type { PreviewSource } from '../shared/types'
import { parseFrameRate } from './ffprobe'

test('locateInFiles maps a global time onto the right file + local offset', () => {
  const durations = [100, 50, 200] // total 350
  assert.deepEqual(locateInFiles(durations, 0), { fileIndex: 0, localSec: 0 })
  assert.deepEqual(locateInFiles(durations, 30), { fileIndex: 0, localSec: 30 })
  assert.deepEqual(locateInFiles(durations, 120), { fileIndex: 1, localSec: 20 })
  assert.deepEqual(locateInFiles(durations, 200), { fileIndex: 2, localSec: 50 })
})

test('locateInFiles clamps negatives and overruns into the last file', () => {
  const durations = [100, 50]
  assert.deepEqual(locateInFiles(durations, -10), { fileIndex: 0, localSec: 0 })
  const over = locateInFiles(durations, 999)
  assert.equal(over.fileIndex, 1)
  assert.ok(over.localSec <= 50 && over.localSec >= 0)
})

test('locateInFiles handles empty duration list', () => {
  assert.deepEqual(locateInFiles([], 42), { fileIndex: 0, localSec: 42 })
})

test('parseFrameRate parses rationals and rejects junk', () => {
  assert.equal(parseFrameRate('30000/1001')?.toFixed(2), '29.97')
  assert.equal(parseFrameRate('25/1'), 25)
  assert.equal(parseFrameRate('25'), 25)
  assert.equal(parseFrameRate('0/0'), null)
  assert.equal(parseFrameRate('N/A'), null)
  assert.equal(parseFrameRate(undefined), null)
})

test('frameArgs always seeks on the input (exact when decoding, no decode from 0)', () => {
  const args = frameArgs(['-f', 'dvdvideo'], 'disc', 1234.5, 480, true)
  const ss = args.indexOf('-ss')
  assert.ok(ss >= 0 && ss < args.indexOf('-i'))
  assert.equal(args[ss + 1], '1234.500')
  assert.equal(args.lastIndexOf('-ss'), ss)
})

const needsFfmpeg = { skip: !binariesPresent() && 'ffmpeg not fetched (npm run fetch-ffmpeg)' }

async function withClip(fn: (source: PreviewSource) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'vob2mp4-test-'))
  try {
    const file = join(dir, 'clip.mkv')
    execFileSync(binaryPath('ffmpeg'), [
      '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=d=4:s=160x120:r=25', '-c:v', 'ffv1', file
    ])
    await fn({
      kind: 'files',
      label: 'clip',
      durationSec: 4,
      frameRate: 25,
      streams: [],
      files: [file],
      fileDurations: [4]
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('extractFrame: a newer request supersedes an older one', needsFfmpeg, async () => {
  await withClip(async (source) => {
    const [older, newer] = await Promise.all([extractFrame(source, 1), extractFrame(source, 2)])
    assert.equal(older.ok, false)
    assert.equal(newer.ok, true)
  })
})

test('cancelPreview stops a running filmstrip', needsFfmpeg, async () => {
  await withClip(async (source) => {
    const full = await generateFilmstrip(source, 4)
    assert.equal(full.length, 4)
    const pending = generateFilmstrip(source, 4)
    cancelPreview()
    assert.equal((await pending).length, 0)
  })
})

test('a cancelled frame request does not start its fallback ffmpeg run', needsFfmpeg, async () => {
  await withClip(async (source) => {
    const pending = extractFrame(source, 1)
    cancelPreview()
    const res = await pending
    assert.equal(res.ok, false)
    if (res.ok) return
    // Superseded, not the error of a second (fallback) capture.
    assert.match(res.error, /Superseded/)
  })
})

test('a time past the last frame is not reported as a damaged source', needsFfmpeg, async () => {
  await withClip(async (source) => {
    // The program claims more time than the file holds, like a seek to the
    // exact end of a DVD title: the engine succeeds but returns no picture.
    if (source.kind !== 'files') return
    const res = await extractFrame({ ...source, durationSec: 10, fileDurations: [10] }, 9)
    assert.equal(res.ok, false)
    if (res.ok) return
    assert.match(res.error, /no picture at this time/i)
    assert.doesNotMatch(res.error, /damaged/i)
  })
})
