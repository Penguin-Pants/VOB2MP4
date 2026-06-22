import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'fs/promises'
import { resolveInput } from './export'
import type { PreviewSource } from '../shared/types'

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
