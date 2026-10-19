import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addJob, clearFinished, listJobs, removeJob, runQueue, stopQueue } from './queue'
import type { ExportRequest, ExportResult } from '../shared/types'

function request(label: string): ExportRequest {
  return {
    source: {
      kind: 'files',
      label,
      durationSec: 100,
      frameRate: 25,
      streams: [],
      files: [`/in/${label}.vob`],
      fileDurations: [100]
    },
    splitPoints: [],
    options: {
      mode: 'copy',
      preset: 'balanced',
      deinterlace: false,
      audioStreamIndices: [],
      burnSubtitleOrdinal: null
    },
    naming: { showName: label, season: 1, startEpisode: 1, outputDir: '/out' }
  }
}

function resetQueue(): void {
  for (const j of listJobs()) removeJob(j.id)
  clearFinished()
}

function statuses(): Array<[string, string]> {
  return listJobs().map((j) => [j.label, j.status])
}

test('runQueue runs every queued job when finished jobs are cleared mid-run', async () => {
  resetQueue()
  addJob(request('A'))
  addJob(request('B'))
  addJob(request('C'))
  const ran: string[] = []
  await runQueue(async (req): Promise<ExportResult> => {
    ran.push(req.source.label)
    // While B runs, the user clicks "Clear finished" (removes A).
    if (req.source.label === 'B') clearFinished()
    return { ok: true, outputs: [] }
  })
  assert.deepEqual(ran, ['A', 'B', 'C'])
  assert.deepEqual(statuses(), [
    ['B', 'done'],
    ['C', 'done']
  ])
})

test('runQueue marks a job as error when its export throws and continues', async () => {
  resetQueue()
  addJob(request('A'))
  addJob(request('B'))
  await runQueue(async (req): Promise<ExportResult> => {
    if (req.source.label === 'A') throw new Error('disk gone')
    return { ok: true, outputs: ['/out/b.mp4'] }
  })
  const [a, b] = listJobs()
  assert.equal(a.status, 'error')
  assert.match(a.error ?? '', /disk gone/)
  assert.equal(b.status, 'done')
})

test('runQueue picks up a job added while the queue runs', async () => {
  resetQueue()
  addJob(request('A'))
  const ran: string[] = []
  await runQueue(async (req): Promise<ExportResult> => {
    ran.push(req.source.label)
    if (req.source.label === 'A') addJob(request('B'))
    return { ok: true, outputs: [] }
  })
  assert.deepEqual(ran, ['A', 'B'])
})

test('removeJob keeps a running job', async () => {
  resetQueue()
  addJob(request('A'))
  await runQueue(async (): Promise<ExportResult> => {
    removeJob(listJobs()[0].id)
    assert.equal(listJobs().length, 1)
    return { ok: true, outputs: [] }
  })
  assert.deepEqual(statuses(), [['A', 'done']])
})

test('stopQueue cancels the running job and leaves later jobs queued', async () => {
  resetQueue()
  addJob(request('A'))
  addJob(request('B'))
  await runQueue(async (_req, _onProgress, signal): Promise<ExportResult> => {
    stopQueue()
    assert.equal(signal?.aborted, true)
    return { ok: false, outputs: [], error: 'Export cancelled.' }
  })
  assert.deepEqual(statuses(), [
    ['A', 'error'],
    ['B', 'queued']
  ])
})
