import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  sanitizeFilename,
  episodeFileName,
  seasonFolderName,
  episodeRelPath
} from '../shared/naming'

test('sanitizeFilename keeps spaces/hyphens, drops illegal chars', () => {
  assert.equal(sanitizeFilename('Star Trek: TNG'), 'Star Trek TNG')
  assert.equal(sanitizeFilename('A/B\\C?*"<>|'), 'ABC')
  assert.equal(sanitizeFilename('  Spaced   Out  '), 'Spaced Out')
  assert.equal(sanitizeFilename('Trailing dots...'), 'Trailing dots')
})

test('episodeFileName builds Plex-style names with zero padding', () => {
  const naming = { showName: 'My Show', season: 1, startEpisode: 1, outputDir: '/out' }
  assert.equal(episodeFileName(naming, 0), 'My Show - S01E01.mp4')
  assert.equal(episodeFileName(naming, 2), 'My Show - S01E03.mp4')
})

test('episodeFileName respects startEpisode and high season numbers', () => {
  const naming = { showName: 'Show', season: 12, startEpisode: 5, outputDir: '/out' }
  assert.equal(episodeFileName(naming, 0), 'Show - S12E05.mp4')
  assert.equal(episodeFileName(naming, 7), 'Show - S12E12.mp4')
})

test('seasonFolderName and episodeRelPath', () => {
  assert.equal(seasonFolderName(3), 'Season 03')
  const naming = { showName: 'Show', season: 2, startEpisode: 1, outputDir: '/out' }
  assert.equal(episodeRelPath(naming, 0), 'Season 02/Show - S02E01.mp4')
})

test('episodeFileName falls back to "Show" when name is empty/illegal', () => {
  const naming = { showName: '???', season: 1, startEpisode: 1, outputDir: '/out' }
  assert.equal(episodeFileName(naming, 0), 'Show - S01E01.mp4')
})
