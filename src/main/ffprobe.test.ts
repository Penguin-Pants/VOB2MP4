import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseProbe, type RawFfprobe } from './ffprobe'

test('parseProbe maps duration and streams', () => {
  const raw: RawFfprobe = {
    format: { duration: '1325.400000' },
    streams: [
      { index: 0, codec_type: 'video', codec_name: 'mpeg2video', width: 720, height: 480 },
      {
        index: 1,
        codec_type: 'audio',
        codec_name: 'ac3',
        channels: 6,
        channel_layout: '5.1',
        tags: { language: 'eng' }
      },
      { index: 2, codec_type: 'subtitle', codec_name: 'dvd_subtitle', tags: { language: 'eng' } }
    ]
  }
  const result = parseProbe(raw)
  assert.equal(result.durationSec, 1325.4)
  assert.equal(result.streams.length, 3)
  assert.deepEqual(result.streams[0], {
    index: 0,
    type: 'video',
    codec: 'mpeg2video',
    language: undefined,
    channels: undefined,
    channelLayout: undefined,
    width: 720,
    height: 480,
    title: undefined
  })
  assert.equal(result.streams[1].type, 'audio')
  assert.equal(result.streams[1].channels, 6)
  assert.equal(result.streams[1].language, 'eng')
  assert.equal(result.streams[2].type, 'subtitle')
})

test('parseProbe treats N/A and missing duration as null', () => {
  assert.equal(parseProbe({ format: { duration: 'N/A' } }).durationSec, null)
  assert.equal(parseProbe({}).durationSec, null)
})

test('parseProbe classifies unknown codec types as other', () => {
  const result = parseProbe({ streams: [{ index: 0, codec_type: 'data', codec_name: 'bin_data' }] })
  assert.equal(result.streams[0].type, 'other')
})

test('parseProbe detects interlacing from field_order', () => {
  assert.equal(
    parseProbe({ streams: [{ index: 0, codec_type: 'video', field_order: 'tt' }] }).interlaced,
    true
  )
  assert.equal(
    parseProbe({ streams: [{ index: 0, codec_type: 'video', field_order: 'progressive' }] })
      .interlaced,
    false
  )
  // absent field_order → treated as progressive
  assert.equal(
    parseProbe({ streams: [{ index: 0, codec_type: 'video' }] }).interlaced,
    false
  )
})

test('parseProbe extracts embedded chapters', () => {
  const result = parseProbe({
    chapters: [
      { id: 0, start_time: '0.000', end_time: '1325.000' },
      { id: 1, start_time: '1325.000', end_time: '2650.000' }
    ]
  })
  assert.equal(result.chapters.length, 2)
  assert.deepEqual(result.chapters[0], { index: 1, startSec: 0, endSec: 1325 })
  assert.equal(result.chapters[1].startSec, 1325)
})
