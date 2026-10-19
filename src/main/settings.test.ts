import { test } from 'node:test'
import assert from 'node:assert/strict'
import { afterCompletedExport, mergeSettings } from './settings'
import type { LastExportSettings } from '../shared/types'

const le: LastExportSettings = {
  mode: 'reencode',
  preset: 'balanced',
  outputDir: '/out',
  showName: 'Show',
  season: 1,
  startEpisode: 1
}

test('mergeSettings deep-merges lastExport', () => {
  const merged = mergeSettings({ lastExport: le }, { lastExport: { season: 2, showName: 'Other' } })
  assert.equal(merged.lastExport?.season, 2)
  assert.equal(merged.lastExport?.showName, 'Other')
  // untouched fields preserved
  assert.equal(merged.lastExport?.preset, 'balanced')
  assert.equal(merged.lastExport?.outputDir, '/out')
})

test('mergeSettings keeps existing when patch omits lastExport', () => {
  const merged = mergeSettings({ lastExport: le }, {})
  assert.deepEqual(merged.lastExport, le)
})

test('mergeSettings sets lastExport from empty base', () => {
  const merged = mergeSettings({}, { lastExport: le })
  assert.deepEqual(merged.lastExport, le)
})

test('mergeSettings never moves the saved start back for the same show', () => {
  // A stale patch (read before a queue job finished) must not undo the job's progress.
  const current = { lastExport: { ...le, startEpisode: 9 } }
  assert.equal(mergeSettings(current, { lastExport: { showName: 'Show', season: 1, startEpisode: 5 } }).lastExport?.startEpisode, 9)
  assert.equal(mergeSettings(current, { lastExport: { startEpisode: 12 } }).lastExport?.startEpisode, 12)
  // Another show or season resets the start.
  assert.equal(mergeSettings(current, { lastExport: { showName: 'Other', startEpisode: 1 } }).lastExport?.startEpisode, 1)
  assert.equal(mergeSettings(current, { lastExport: { season: 2, startEpisode: 1 } }).lastExport?.startEpisode, 1)
})

test('afterCompletedExport moves the saved start past a finished job', () => {
  const naming = { showName: 'Show', season: 1, startEpisode: 5, outputDir: '/out' }
  assert.deepEqual(afterCompletedExport({ lastExport: le }, naming, 4), { lastExport: { startEpisode: 9 } })
})

test('afterCompletedExport never moves the saved start backwards', () => {
  const naming = { showName: 'Show', season: 1, startEpisode: 1, outputDir: '/out' }
  assert.deepEqual(afterCompletedExport({ lastExport: { ...le, startEpisode: 20 } }, naming, 4), {})
})

test('afterCompletedExport leaves another show alone', () => {
  const naming = { showName: 'Other', season: 1, startEpisode: 1, outputDir: '/out' }
  assert.deepEqual(afterCompletedExport({ lastExport: le }, naming, 4), {})
})
