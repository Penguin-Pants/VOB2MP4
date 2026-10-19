import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { inspectPaths } from './inspect'
import { UserError, plainReason } from '../shared/userError'

async function withDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'vob2mp4-inspect-'))
  try {
    await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** The message the user sees for a failed inspect (see the input:inspect handler). */
async function shownError(paths: string[]): Promise<string> {
  const err = await inspectPaths(paths).then(
    () => assert.fail('inspect did not fail'),
    (e: unknown) => e
  )
  return plainReason(err)
}

test('a folder without video tells the user which buttons to use', () =>
  withDir(async (dir) => {
    await writeFile(join(dir, 'notes.txt'), 'x')
    assert.match(await shownError([dir]), /no VIDEO_TS folder and no video files.*Open VOB file/)
  }))

test('an empty VIDEO_TS folder asks for another disc folder', () =>
  withDir(async (dir) => {
    const videoTs = join(dir, 'VIDEO_TS')
    await mkdir(videoTs)
    assert.match(await shownError([videoTs]), /That VIDEO_TS folder has no titles.*another disc folder/)
  }))

test('selected files that are not video list the supported kinds', () =>
  withDir(async (dir) => {
    const file = join(dir, 'cover.jpg')
    await writeFile(file, 'x')
    assert.match(await shownError([file]), /None of the selected files is a video.*\.VOB/)
  }))

test('a selection that no longer exists gets a plain reason, not the system text', () =>
  withDir(async (dir) => {
    const msg = await shownError([join(dir, 'gone')])
    assert.match(msg, /The file or folder is not there\./)
    assert.doesNotMatch(msg, /ENOENT|gone/)
  }))

test('inspect failures from the app are UserErrors', async () => {
  await assert.rejects(inspectPaths([]), UserError)
})
