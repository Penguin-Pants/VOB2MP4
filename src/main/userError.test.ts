import { test } from 'node:test'
import assert from 'node:assert/strict'
import { UserError, frameReason, plainReason, videoReason } from '../shared/userError'

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
  assert.match(videoReason(''), /could not process/i)
})

// Real output of a 160x121 source: the H.264 encoder rejects the odd height.
const ENCODER_FAILURE = `[libx264 @ 0x55] height not divisible by 2 (160x121)
[vost#0:0/libx264 @ 0x55] Error while opening encoder - maybe incorrect parameters such as bit_rate, rate, width or height.
[out#0/mp4 @ 0x55] Nothing was written into output file, because at least one of its streams received no packets.`

test('an engine failure that is not about the input does not blame the source', () => {
  const msg = videoReason(ENCODER_FAILURE)
  assertPlain(msg)
  assert.doesNotMatch(msg, /damaged|rip the disc/i)
  assert.match(msg, /could not process/i)
})

test('a frame request past the last picture says so', () => {
  assert.match(frameReason(0, ''), /no picture at this time/i)
  const tooFar = '[out#0/image2pipe @ 0x55] Nothing was written into output file, because at least one of its streams received no packets.'
  assert.match(frameReason(234, tooFar), /no picture at this time/i)
})

test('a frame request that hits decode errors reports damage, not the playhead', () => {
  const decodeErrors = `[h264 @ 0x55] error while decoding MB 12 7, bytestream -5
[h264 @ 0x55] concealing 300 DC, 300 AC, 300 MV errors in I frame
[out#0/image2pipe @ 0x55] Nothing was written into output file, because at least one of its streams received no packets.`
  const msg = frameReason(234, decodeErrors)
  assert.match(msg, /damaged/i)
  assert.doesNotMatch(msg, /playhead/i)
})
