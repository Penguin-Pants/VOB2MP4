import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { resolveInput, runExport } from './export'
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
