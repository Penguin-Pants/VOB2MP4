import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeSettings } from './settings'
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
