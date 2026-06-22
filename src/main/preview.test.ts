import { test } from 'node:test'
import assert from 'node:assert/strict'
import { locateInFiles } from './preview'
import { parseFrameRate } from './ffprobe'

test('locateInFiles maps a global time onto the right file + local offset', () => {
  const durations = [100, 50, 200] // total 350
  assert.deepEqual(locateInFiles(durations, 0), { fileIndex: 0, localSec: 0 })
  assert.deepEqual(locateInFiles(durations, 30), { fileIndex: 0, localSec: 30 })
  assert.deepEqual(locateInFiles(durations, 120), { fileIndex: 1, localSec: 20 })
  assert.deepEqual(locateInFiles(durations, 200), { fileIndex: 2, localSec: 50 })
})

test('locateInFiles clamps negatives and overruns into the last file', () => {
  const durations = [100, 50]
  assert.deepEqual(locateInFiles(durations, -10), { fileIndex: 0, localSec: 0 })
  const over = locateInFiles(durations, 999)
  assert.equal(over.fileIndex, 1)
  assert.ok(over.localSec <= 50 && over.localSec >= 0)
})

test('locateInFiles handles empty duration list', () => {
  assert.deepEqual(locateInFiles([], 42), { fileIndex: 0, localSec: 42 })
})

test('parseFrameRate parses rationals and rejects junk', () => {
  assert.equal(parseFrameRate('30000/1001')?.toFixed(2), '29.97')
  assert.equal(parseFrameRate('25/1'), 25)
  assert.equal(parseFrameRate('25'), 25)
  assert.equal(parseFrameRate('0/0'), null)
  assert.equal(parseFrameRate('N/A'), null)
  assert.equal(parseFrameRate(undefined), null)
})
