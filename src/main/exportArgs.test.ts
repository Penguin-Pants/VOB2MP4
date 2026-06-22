import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildExportArgs, videoFilterChain } from './exportArgs'
import type { ExportOptions } from '../shared/types'

const base: ExportOptions = {
  mode: 'reencode',
  preset: 'balanced',
  deinterlace: true,
  audioStreamIndices: [1],
  burnSubtitleOrdinal: null
}

function argsFor(options: ExportOptions): string[] {
  return buildExportArgs({
    inputArgs: ['-f', 'concat', '-safe', '0'],
    input: '/tmp/list.txt',
    startSec: 100,
    endSec: 220,
    output: '/out/ep.mp4',
    options
  })
}

test('videoFilterChain includes yadif only when deinterlacing', () => {
  assert.ok(videoFilterChain(base).startsWith('yadif,'))
  assert.ok(!videoFilterChain({ ...base, deinterlace: false }).includes('yadif'))
  assert.ok(videoFilterChain(base).includes('setsar=1'))
})

test('re-encode uses input -ss seek, -t duration, libx264 and aac', () => {
  const a = argsFor(base)
  const joined = a.join(' ')
  // -ss before -i (input seek)
  assert.ok(a.indexOf('-ss') < a.indexOf('-i'))
  assert.ok(joined.includes('-ss 100.000'))
  assert.ok(joined.includes('-t 120.000'))
  assert.ok(joined.includes('-c:v libx264'))
  assert.ok(joined.includes('-crf 21')) // balanced
  assert.ok(joined.includes('-c:a aac'))
  assert.ok(joined.includes('-map 0:1'))
  assert.ok(joined.includes('+faststart'))
  assert.ok(joined.includes('-map_chapters -1')) // don't carry source chapters
})

test('copy mode copies streams and skips re-encode/subtitles', () => {
  const a = argsFor({ ...base, mode: 'copy', burnSubtitleOrdinal: 0 }).join(' ')
  assert.ok(a.includes('-c copy'))
  assert.ok(!a.includes('libx264'))
  assert.ok(!a.includes('overlay'))
  assert.ok(a.includes('-map 0:v:0'))
  assert.ok(a.includes('-map 0:1'))
})

test('subtitle burn-in builds an overlay filter_complex in re-encode mode', () => {
  const a = argsFor({ ...base, burnSubtitleOrdinal: 1 }).join(' ')
  assert.ok(a.includes('-filter_complex'))
  assert.ok(a.includes('[0:v:0][0:s:1]overlay'))
  assert.ok(a.includes('-map [outv]'))
})

test('no audio selected omits audio mapping and codec', () => {
  const a = argsFor({ ...base, audioStreamIndices: [] }).join(' ')
  assert.ok(!a.includes('-c:a'))
  assert.ok(!/-map 0:\d/.test(a.replace('-map 0:v:0', '')))
})

test('preset selects the right CRF', () => {
  assert.ok(argsFor({ ...base, preset: 'high' }).join(' ').includes('-crf 18'))
  assert.ok(argsFor({ ...base, preset: 'smaller' }).join(' ').includes('-crf 24'))
})
