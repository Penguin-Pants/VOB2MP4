import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterCompletedExport, getSettings, lastDir, mergeSettings, rememberDir, updateSettings } from './settings'
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

test('mergeSettings deep-merges remembered dialog folders', () => {
  const merged = mergeSettings(
    { lastExport: le, lastDirs: { input: '/discs', output: '/tv' } },
    { lastDirs: { input: '/discs2' } }
  )
  assert.deepEqual(merged.lastDirs, { input: '/discs2', output: '/tv' })
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

test('rememberDir saves a dialog folder that lastDir gives back, per kind', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vob2mp4-settings-'))
  process.env.VOB2MP4_SETTINGS_DIR = dir
  try {
    assert.equal(lastDir('input'), undefined)
    updateSettings({ lastExport: le })
    rememberDir('input', '/discs')
    rememberDir('output', '/tv')
    rememberDir('input', '/discs2')
    assert.equal(lastDir('input'), '/discs2')
    assert.equal(lastDir('output'), '/tv')
    assert.equal(lastDir('project'), undefined)
    // Other settings survive.
    assert.deepEqual(getSettings().lastExport, le)
  } finally {
    delete process.env.VOB2MP4_SETTINGS_DIR
    rmSync(dir, { recursive: true, force: true })
  }
})
