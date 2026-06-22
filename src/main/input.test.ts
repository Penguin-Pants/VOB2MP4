import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseVobName,
  groupVobFiles,
  groupMediaFiles,
  looksLikeVideoTs,
  naturalCompare,
  extOf,
  isVobFile,
  isMediaFile,
  stripExt
} from './input'

test('parseVobName parses VTS set/part and ignores case + dirs', () => {
  assert.deepEqual(parseVobName('VTS_01_2.VOB'), { set: '01', part: 2 })
  assert.deepEqual(parseVobName('vts_03_0.vob'), { set: '03', part: 0 })
  assert.deepEqual(parseVobName('/some/path/VTS_12_4.VOB'), { set: '12', part: 4 })
  assert.equal(parseVobName('movie.vob'), null)
  assert.equal(parseVobName('VIDEO_TS.VOB'), null)
})

test('groupVobFiles groups a title set in part order, dropping the menu (part 0)', () => {
  const groups = groupVobFiles([
    'd/VTS_01_2.VOB',
    'd/VTS_01_10.VOB',
    'd/VTS_01_1.VOB',
    'd/VTS_01_0.VOB'
  ])
  assert.equal(groups.length, 1)
  assert.equal(groups[0].id, 'VTS_01')
  assert.deepEqual(groups[0].files, ['d/VTS_01_1.VOB', 'd/VTS_01_2.VOB', 'd/VTS_01_10.VOB'])
})

test('groupVobFiles separates multiple title sets, sorted', () => {
  const groups = groupVobFiles(['VTS_02_1.VOB', 'VTS_01_1.VOB', 'VTS_01_2.VOB'])
  assert.deepEqual(
    groups.map((g) => g.id),
    ['VTS_01', 'VTS_02']
  )
  assert.deepEqual(groups[0].files, ['VTS_01_1.VOB', 'VTS_01_2.VOB'])
})

test('groupVobFiles puts non-VTS files into one natural-sorted group', () => {
  const groups = groupVobFiles(['part10.vob', 'part2.vob', 'part1.vob'])
  assert.equal(groups.length, 1)
  assert.equal(groups[0].id, 'selected')
  assert.deepEqual(groups[0].files, ['part1.vob', 'part2.vob', 'part10.vob'])
})

test('looksLikeVideoTs detects DVD structures', () => {
  assert.equal(looksLikeVideoTs(['VIDEO_TS']), true)
  assert.equal(looksLikeVideoTs(['VTS_01_0.IFO', 'VTS_01_1.VOB']), true)
  assert.equal(looksLikeVideoTs(['VTS_01_1.VOB']), true)
  assert.equal(looksLikeVideoTs(['readme.txt', 'cover.jpg']), false)
})

test('naturalCompare orders embedded numbers numerically', () => {
  assert.ok(naturalCompare('a2', 'a10') < 0)
  assert.ok(naturalCompare('a10', 'a2') > 0)
})

test('extOf / isVobFile / isMediaFile classify by extension', () => {
  assert.equal(extOf('/x/Show.M4V'), 'm4v')
  assert.equal(extOf('noext'), '')
  assert.ok(isVobFile('VTS_01_1.VOB'))
  assert.ok(!isVobFile('show.m4v'))
  assert.ok(isMediaFile('show.m4v'))
  assert.ok(isMediaFile('movie.MP4'))
  assert.ok(isMediaFile('clip.mkv'))
  assert.ok(!isMediaFile('VTS_01_1.VOB'))
  assert.ok(!isMediaFile('notes.txt'))
})

test('stripExt removes the extension', () => {
  assert.equal(stripExt('/path/Season One.m4v'), 'Season One')
  assert.equal(stripExt('.hidden'), '.hidden')
})

test('groupMediaFiles makes one program per file, natural-sorted', () => {
  const groups = groupMediaFiles(['/d/Disc 10.m4v', '/d/Disc 2.m4v', '/d/Disc 1.m4v'])
  assert.equal(groups.length, 3)
  assert.deepEqual(
    groups.map((g) => g.label),
    ['Disc 1', 'Disc 2', 'Disc 10']
  )
  assert.deepEqual(groups[0].files, ['/d/Disc 1.m4v'])
  assert.equal(groups[0].id, 'media:Disc 1.m4v')
})
