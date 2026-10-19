import { test } from 'node:test'
import assert from 'node:assert/strict'
import { UserError, plainReason, videoReason } from '../shared/userError'

const errno = (code: string, extra: object = {}): Error =>
  Object.assign(new Error(`${code}: raw system text, open 'C:\\secret\\path'`), { code, ...extra })

// Every message is for the user: no system codes, paths or engine names.
function assertPlain(msg: string): void {
  assert.ok(msg.length > 0, 'empty message')
  assert.doesNotMatch(msg, /\bE[A-Z]{3,}\b/)
  assert.doesNotMatch(msg, /errno|syscall|ffmpeg|ffprobe|spawn|stack|\\|\/|exit \d/i)
  assert.match(msg, /\.$/, 'not a full sentence')
}

test('a UserError keeps its own message', () => {
  assert.equal(plainReason(new UserError('No video files in that folder.')), 'No video files in that folder.')
})

test('a missing file or folder says what to do', () => {
  const msg = plainReason(errno('ENOENT', { syscall: 'stat' }))
  assertPlain(msg)
  assert.match(msg, /not there/i)
  assert.match(msg, /choose/i)
})

test('a missing video engine is not reported as a missing file', () => {
  const msg = plainReason(errno('ENOENT', { syscall: 'spawn /app/resources/ffmpeg/ffmpeg' }))
  assertPlain(msg)
  assert.match(msg, /video engine/i)
  assert.match(msg, /download/i)
})

for (const [code, words] of [
  ['EACCES', /access/i],
  ['EPERM', /access/i],
  ['EBUSY', /another program/i],
  ['ENOSPC', /full/i],
  ['EROFS', /read-only/i],
  ['ENOTDIR', /not a folder/i]
] as const) {
  test(`${code} gets a plain reason`, () => {
    const msg = plainReason(errno(code))
    assertPlain(msg)
    assert.match(msg, words)
  })
}

test('an unknown error hides its text', () => {
  const msg = plainReason(new Error('TypeError: cannot read properties of undefined at foo.js:12'))
  assertPlain(msg)
  assert.match(msg, /try again/i)
  assert.equal(plainReason('a string thrown'), msg)
})

test('video engine output never reaches the user', () => {
  const stderr = "[mpeg @ 0x55d] Invalid data found when processing input\nC:\\rips\\VTS_01_1.VOB: Invalid data found"
  const msg = videoReason(stderr)
  assertPlain(msg)
  assert.match(msg, /damaged/i)
  assert.match(msg, /video player|rip the disc/i)
})

test('video engine output for a missing input, a full disk or no access', () => {
  assert.match(videoReason("/rips/VTS_01_1.VOB: No such file or directory"), /not there/i)
  assert.match(videoReason('av_interleaved_write_frame(): No space left on device'), /full/i)
  assert.match(videoReason("/out/S01E01.mp4.part: Permission denied"), /access/i)
  assert.match(videoReason(''), /damaged/i)
})
