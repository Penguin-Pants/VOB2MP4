import { mock, test } from 'node:test'
import { createRequire } from 'module'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'fs/promises'
import { execFileSync } from 'child_process'
import { join } from 'path'
import { tmpdir } from 'os'
import { reservationKey, resolveInput, runExport, waitForExports } from './export'
import { binariesPresent, binaryPath } from './ffmpeg'
import type { ExportRequest, PreviewSource } from '../shared/types'

const base = { label: 'x', frameRate: null, streams: [] }

test('resolveInput: single-file program uses direct input (no concat demuxer)', async () => {
  const source: PreviewSource = {
    ...base,
    kind: 'files',
    durationSec: 1,
    files: ['/tmp/a.m4v'],
    fileDurations: [1]
  }
  const r = await resolveInput(source)
  // Direct file input is what fixes dropped video on sparse-keyframe H.264.
  assert.deepEqual(r.inputArgs, [])
  assert.equal(r.input, '/tmp/a.m4v')
  await r.cleanup()
})

test('resolveInput: multiple files use the concat demuxer with a list', async () => {
  const source: PreviewSource = {
    ...base,
    kind: 'files',
    durationSec: 2,
    files: ['/tmp/a.vob', '/tmp/b.vob'],
    fileDurations: [1, 1]
  }
  const r = await resolveInput(source)
  assert.deepEqual(r.inputArgs, ['-f', 'concat', '-safe', '0'])
  const list = await readFile(r.input, 'utf8')
  assert.ok(list.includes("file '/tmp/a.vob'"))
  assert.ok(list.includes("file '/tmp/b.vob'"))
  await r.cleanup()
})

test('resolveInput: DVD title uses the dvdvideo demuxer at the disc root', async () => {
  const source: PreviewSource = {
    ...base,
    kind: 'dvd',
    durationSec: 10,
    videoTsPath: '/discs/MyDisc/VIDEO_TS',
    title: 3
  }
  const r = await resolveInput(source)
  assert.deepEqual(r.inputArgs, ['-f', 'dvdvideo', '-title', '3'])
  assert.equal(r.input, '/discs/MyDisc')
  await r.cleanup()
})

const needsFfmpeg = { skip: !binariesPresent() && 'ffmpeg not fetched (npm run fetch-ffmpeg)' }

/** Generate a short lossless test clip with the bundled ffmpeg. */
function makeClip(dir: string, name: string, size: string): string {
  const path = join(dir, name)
  execFileSync(binaryPath('ffmpeg'), [
    '-v', 'error', '-f', 'lavfi', '-i', `testsrc=d=2:s=${size}:r=25`, '-c:v', 'ffv1', path
  ])
  return path
}

function exportRequest(source: PreviewSource, outputDir: string): ExportRequest {
  return {
    source,
    splitPoints: [],
    options: {
      mode: 'reencode',
      preset: 'balanced',
      deinterlace: false,
      audioStreamIndices: [],
      burnSubtitleOrdinal: null
    },
    naming: { showName: 'Show', season: 1, startEpisode: 1, outputDir }
  }
}

test('runExport resolves with an error when the season folder cannot be created', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vob2mp4-test-'))
  try {
    // A plain file where the output folder should be makes mkdir fail.
    const blocker = join(dir, 'not-a-dir')
    await writeFile(blocker, '')
    const source: PreviewSource = {
      ...base,
      kind: 'files',
      durationSec: 10,
      files: [join(dir, 'in.vob')],
      fileDurations: [10]
    }
    const res = await runExport(exportRequest(source, blocker), () => undefined)
    assert.equal(res.ok, false)
    assert.deepEqual(res.outputs, [])
    assert.ok(res.error && res.error.length > 0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('runExport refuses to overwrite an existing episode file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vob2mp4-test-'))
  try {
    const existing = join(dir, 'Season 01', 'Show - S01E02.mp4')
    await mkdir(join(dir, 'Season 01'))
    await writeFile(existing, 'earlier disc')
    const source: PreviewSource = {
      ...base,
      kind: 'files',
      durationSec: 100,
      files: [join(dir, 'in.vob')],
      fileDurations: [100]
    }
    const req = { ...exportRequest(source, dir), splitPoints: [50] }
    const res = await runExport(req, () => undefined)
    assert.equal(res.ok, false)
    assert.match(res.error ?? '', /S01E02/)
    // Nothing was encoded, no placeholder is left and the earlier file is untouched.
    assert.deepEqual(res.outputs, [])
    await assert.rejects(stat(join(dir, 'Season 01', 'Show - S01E01.mp4')), { code: 'ENOENT' })
    assert.equal(await readFile(existing, 'utf8'), 'earlier disc')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test(
  'runExport deletes the partial episode file when ffmpeg fails',
  needsFfmpeg,
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vob2mp4-test-'))
    try {
      // An odd frame height makes libx264 fail after ffmpeg opens the output.
      const input = makeClip(dir, 'odd.mkv', '160x121')
      const source: PreviewSource = {
        ...base,
        kind: 'files',
        durationSec: 2,
        files: [input],
        fileDurations: [2]
      }
      const res = await runExport(exportRequest(source, dir), () => undefined)
      assert.equal(res.ok, false)
      await assert.rejects(stat(join(dir, 'Season 01', 'Show - S01E01.mp4')), { code: 'ENOENT' })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
)

test('runExport stops and removes the episode file when cancelled', needsFfmpeg, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vob2mp4-test-'))
  try {
    const input = makeClip(dir, 'clip.mkv', '160x120')
    const source: PreviewSource = {
      ...base,
      kind: 'files',
      durationSec: 2,
      files: [input],
      fileDurations: [2]
    }
    const ctrl = new AbortController()
    // Cancel as soon as the first episode starts.
    const res = await runExport(exportRequest(source, dir), () => ctrl.abort(), ctrl.signal)
    assert.equal(res.ok, false)
    assert.match(res.error ?? '', /cancelled/i)
    await assert.rejects(stat(join(dir, 'Season 01', 'Show - S01E01.mp4')), { code: 'ENOENT' })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('runExport writes the episode when not cancelled', needsFfmpeg, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vob2mp4-test-'))
  try {
    const input = makeClip(dir, 'clip.mkv', '160x120')
    const source: PreviewSource = {
      ...base,
      kind: 'files',
      durationSec: 2,
      files: [input],
      fileDurations: [2]
    }
    const res = await runExport(exportRequest(source, dir), () => undefined, new AbortController().signal)
    assert.equal(res.ok, true, res.error)
    assert.ok((await stat(res.outputs[0])).size > 0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('runExport resolves with an error when the concat list cannot be written', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vob2mp4-test-'))
  const blocker = join(dir, 'not-a-dir')
  // os.tmpdir() reads TMPDIR on POSIX and TEMP/TMP on Windows.
  const vars = ['TMPDIR', 'TEMP', 'TMP'] as const
  const saved = vars.map((v) => process.env[v])
  try {
    await writeFile(blocker, '')
    for (const v of vars) process.env[v] = blocker
    const source: PreviewSource = {
      ...base,
      kind: 'files',
      durationSec: 10,
      files: [join(dir, 'a.vob'), join(dir, 'b.vob')],
      fileDurations: [5, 5]
    }
    const res = await runExport(exportRequest(source, dir), () => undefined)
    assert.equal(res.ok, false)
    assert.deepEqual(res.outputs, [])
    assert.ok(res.error && res.error.length > 0)
  } finally {
    vars.forEach((v, i) => {
      if (saved[i] === undefined) delete process.env[v]
      else process.env[v] = saved[i]
    })
    await rm(dir, { recursive: true, force: true })
  }
})

test('runExport removes its reserved files when it fails before encoding', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vob2mp4-test-'))
  try {
    const source: PreviewSource = {
      ...base,
      kind: 'files',
      durationSec: 100,
      files: [join(dir, 'in.vob')],
      fileDurations: [100]
    }
    const req = { ...exportRequest(source, dir), splitPoints: [50] }
    const res = await runExport(req, () => {
      throw new Error('progress listener broke')
    })
    assert.equal(res.ok, false)
    for (const ep of ['E01', 'E02']) {
      await assert.rejects(stat(join(dir, 'Season 01', `Show - S01${ep}.mp4`)), { code: 'ENOENT' })
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('waitForExports resolves when no export runs', async () => {
  await waitForExports()
})

test('waitForExports waits until a cancelled export removed its files', needsFfmpeg, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vob2mp4-test-'))
  try {
    const input = makeClip(dir, 'clip.mkv', '160x120')
    const source: PreviewSource = {
      ...base,
      kind: 'files',
      durationSec: 2,
      files: [input],
      fileDurations: [2]
    }
    const ctrl = new AbortController()
    // Like app quit: abort, then wait without holding the export promise.
    let finished = false
    void runExport(exportRequest(source, dir), () => ctrl.abort(), ctrl.signal).then(() => {
      finished = true
    })
    await waitForExports()
    assert.equal(finished, true)
    await assert.rejects(stat(join(dir, 'Season 01', 'Show - S01E01.mp4')), { code: 'ENOENT' })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('runExport reuses an empty placeholder left by an interrupted run', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vob2mp4-test-'))
  try {
    // A crash or kill can leave the zero-byte reservation behind.
    await mkdir(join(dir, 'Season 01'))
    const stale = join(dir, 'Season 01', 'Show - S01E01.mp4')
    await writeFile(stale, '')
    const source: PreviewSource = {
      ...base,
      kind: 'files',
      durationSec: 10,
      files: [join(dir, 'missing.vob')],
      fileDurations: [10]
    }
    const res = await runExport(exportRequest(source, dir), () => undefined)
    // It gets past the reservation (then fails on the missing input).
    assert.equal(res.ok, false)
    assert.doesNotMatch(res.error ?? '', /already exists/)
    await assert.rejects(stat(stale), { code: 'ENOENT' })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('runExport keeps its result when the temp concat list cannot be deleted', needsFfmpeg, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vob2mp4-test-'))
  const fsp = createRequire(__filename)('fs/promises') as typeof import('fs/promises')
  try {
    const files = [makeClip(dir, 'a.mkv', '160x120'), makeClip(dir, 'b.mkv', '160x120')]
    const source: PreviewSource = { ...base, kind: 'files', durationSec: 4, files, fileDurations: [2, 2] }
    const realRm = fsp.rm
    // Only the concat list delete fails; other deletes (test cleanup) still work.
    mock.method(fsp, 'rm', async (path: string, opts?: object) => {
      if (String(path).includes('vob2mp4-concat-')) throw new Error('EBUSY: resource busy or locked')
      return realRm(path, opts)
    })
    const res = await runExport(exportRequest(source, dir), () => undefined)
    assert.equal(res.ok, true, res.error)
    assert.equal(res.outputs.length, 1)
  } finally {
    mock.restoreAll()
    await rm(dir, { recursive: true, force: true })
  }
})

test('reservationKey matches case-variant paths on Windows only', () => {
  assert.equal(
    reservationKey('C:\\TV\\Season 01\\Show - S01E01.mp4', 'win32'),
    reservationKey('c:\\tv\\season 01\\show - s01e01.mp4', 'win32')
  )
  assert.notEqual(reservationKey('/tv/Show.mp4', 'linux'), reservationKey('/tv/show.mp4', 'linux'))
})
