import { test } from 'node:test'
import assert from 'node:assert/strict'
import { binariesPresent, killAllFfmpeg, parseOutTime, runFfmpeg } from './ffmpeg'

const needsFfmpeg = { skip: !binariesPresent() && 'ffmpeg not fetched (npm run fetch-ffmpeg)' }

test('parseOutTime reads -progress out_time lines', () => {
  assert.equal(parseOutTime('out_time=01:02:03.500000'), 3723.5)
  assert.equal(parseOutTime('out_time=00:00:07'), 7)
  assert.equal(parseOutTime('frame=12'), null)
  assert.equal(parseOutTime('out_time=N/A'), null)
})

test('runFfmpeg collects stdout and reports progress', needsFfmpeg, async () => {
  const seen: number[] = []
  const progress = runFfmpeg(
    ['-v', 'error', '-progress', 'pipe:1', '-f', 'lavfi', '-i', 'testsrc=d=1:s=64x48', '-f', 'null', '-'],
    (t) => seen.push(t)
  )
  assert.equal((await progress.done).code, 0)
  assert.ok(seen.length > 0)

  const capture = runFfmpeg(['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=d=1:s=64x48', '-frames:v', '1', '-f', 'mjpeg', 'pipe:1'])
  const out = await capture.done
  assert.equal(out.code, 0)
  assert.ok(out.stdout.length > 0)
})

test('killAllFfmpeg stops running processes', needsFfmpeg, async () => {
  // An endless source only ends when killed.
  const run = runFfmpeg(['-v', 'error', '-f', 'lavfi', '-i', 'testsrc', '-f', 'null', '-'])
  setTimeout(killAllFfmpeg, 100)
  assert.notEqual((await run.done).code, 0)
})
