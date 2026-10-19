import { test } from 'node:test'
import assert from 'node:assert/strict'
import { exportAndRemember, nextFreeEpisode, queueAndRemember, reconcileQueuedStart } from '../renderer/src/exportFlow'
import type { AppSettings, ExportRequest, ExportResult, QueueJobView, SettingsPatch } from '../shared/types'

// One episode from E04, so the next start is E05.
const req = { naming: { showName: 'Show', season: 1, startEpisode: 4, outputDir: '/tv' } } as ExportRequest
const remember: SettingsPatch = { lastExport: { startEpisode: 5 } }

function fakeApi(result: ExportResult | Error, settings: AppSettings = {}) {
  const saved: SettingsPatch[] = []
  return {
    saved,
    api: {
      getSettings: async (): Promise<AppSettings> => settings,
      runExport: async (): Promise<ExportResult> => {
        if (result instanceof Error) throw result
        return result
      },
      queueAdd: async () => {
        if (result instanceof Error) throw result
        return []
      },
      updateSettings: async (p: SettingsPatch) => {
        saved.push(p)
        return {}
      }
    }
  }
}

test('exportAndRemember saves the next start episode after a successful export', async () => {
  const { api, saved } = fakeApi({ ok: true, outputs: ['/out/a.mp4'] })
  const res = await exportAndRemember(api, req, remember)
  assert.equal(res.ok, true)
  assert.deepEqual(saved, [remember])
})

test('exportAndRemember keeps the saved start episode when the export fails', async () => {
  const { api, saved } = fakeApi({ ok: false, outputs: [], error: 'S01E01 already exists' })
  const res = await exportAndRemember(api, req, remember)
  assert.equal(res.ok, false)
  assert.deepEqual(saved, [])
})

test('queueAndRemember saves the job start, not the advanced start episode', async () => {
  // The queue lives in memory: its numbers are only taken once a job finishes.
  const ok = fakeApi({ ok: true, outputs: [] })
  const queued = { naming: { showName: 'Show', season: 1, startEpisode: 1, outputDir: '/tv' } } as ExportRequest
  await queueAndRemember(ok.api, queued, { lastExport: { startEpisode: 5, showName: 'Show' } })
  assert.deepEqual(ok.saved, [{ lastExport: { startEpisode: 1, showName: 'Show' } }])

  const failed = fakeApi(new Error('IPC failed'))
  await assert.rejects(queueAndRemember(failed.api, queued, remember))
  assert.deepEqual(failed.saved, [])
})


test('queueAndRemember does not move the saved start of the same show past a queued job', async () => {
  // E01-E04 then E05-E08 queued: removing both must give E01 back.
  const saved = { mode: 'reencode', preset: 'balanced', outputDir: '/tv', showName: 'Show', season: 1, startEpisode: 1 } as const
  const { api, saved: patches } = fakeApi({ ok: true, outputs: [] }, { lastExport: saved })
  const second = { naming: { showName: 'Show', season: 1, startEpisode: 5, outputDir: '/tv' } } as ExportRequest
  await queueAndRemember(api, second, { lastExport: { startEpisode: 9, showName: 'Show', season: 1 } })
  assert.equal(patches[0].lastExport?.startEpisode, 1)
})

test('queueAndRemember keeps a later saved start for the same show', async () => {
  // E01-E19 are done (saved start E20); queueing E01 keeps E20.
  const saved = { mode: 'reencode', preset: 'balanced', outputDir: '/tv', showName: 'Show', season: 1, startEpisode: 20 } as const
  const redo = { naming: { showName: 'Show', season: 1, startEpisode: 3, outputDir: '/tv' } } as ExportRequest
  const queued = fakeApi({ ok: true, outputs: [] }, { lastExport: saved })
  await queueAndRemember(queued.api, { ...redo, naming: { ...redo.naming, startEpisode: 1 } }, { lastExport: { showName: 'Show', season: 1 } })
  assert.equal(queued.saved[0].lastExport?.startEpisode, 20)
})

function job(id: string, startEpisode: number, episodeCount: number, extra: Partial<QueueJobView> = {}): QueueJobView {
  return {
    id,
    label: id,
    showName: 'Show',
    season: 1,
    startEpisode,
    episodeCount,
    status: 'queued',
    fraction: 0,
    outputs: [],
    ...extra
  }
}

const saved = { mode: 'reencode' as const, preset: 'balanced' as const, outputDir: '/tv', showName: 'Show', season: 1, startEpisode: 1 }

test('nextFreeEpisode starts after the queued jobs of the same show and season', () => {
  assert.equal(nextFreeEpisode(saved, [job('a', 1, 4), job('b', 5, 4)]), 9)
})

test('nextFreeEpisode follows the live queue, so removal order does not matter', () => {
  // Remove the first job, then the second: the queue is empty again.
  assert.equal(nextFreeEpisode(saved, [job('b', 5, 4)]), 9)
  assert.equal(nextFreeEpisode(saved, []), 1)
})

test('nextFreeEpisode ignores other shows, other seasons and failed jobs that wrote nothing', () => {
  const jobs = [
    job('x', 1, 10, { showName: 'Other' }),
    job('y', 1, 10, { season: 2 }),
    job('z', 1, 10, { status: 'error' })
  ]
  assert.equal(nextFreeEpisode(saved, jobs), 1)
})

test('nextFreeEpisode keeps the saved start when it is already past the queue', () => {
  assert.equal(nextFreeEpisode({ ...saved, startEpisode: 20 }, [job('a', 1, 4)]), 20)
  assert.equal(nextFreeEpisode(undefined, [job('a', 1, 4)]), undefined)
})

test('exportAndRemember waits for the settings save before it resolves', async () => {
  let saved = false
  const api = {
    runExport: async (): Promise<ExportResult> => ({ ok: true, outputs: ['/out/a.mp4'] }),
    queueAdd: async () => [],
    getSettings: async (): Promise<AppSettings> => ({}),
    updateSettings: async () => {
      await new Promise((r) => setTimeout(r, 20))
      saved = true
      return {}
    }
  }
  await exportAndRemember(api, req, remember)
  assert.equal(saved, true)
})

test('a failed settings save does not turn a finished export into a failure', async () => {
  const api = {
    runExport: async (): Promise<ExportResult> => ({ ok: true, outputs: ['/out/a.mp4'] }),
    queueAdd: async () => [],
    getSettings: async (): Promise<AppSettings> => ({}),
    updateSettings: async () => {
      throw new Error('disk full')
    }
  }
  const res = await exportAndRemember(api, req, remember)
  assert.equal(res.ok, true)
})

test('exportAndRemember moves past the episodes a failed export already wrote', async () => {
  const { api, saved } = fakeApi({ ok: false, outputs: ['/tv/S01E01.mp4', '/tv/S01E02.mp4'], error: 'Episode 3 failed' })
  const partial = { naming: { showName: 'Show', season: 1, startEpisode: 1, outputDir: '/tv' } } as ExportRequest
  await exportAndRemember(api, partial, { lastExport: { showName: 'Show', startEpisode: 5 } })
  assert.deepEqual(saved, [{ lastExport: { showName: 'Show', startEpisode: 3 } }])
})

test('nextFreeEpisode counts only the written episodes of a failed job', () => {
  const failed = job('f', 1, 4, { status: 'error', outputs: ['/tv/S01E01.mp4'] })
  assert.equal(nextFreeEpisode(saved, [failed]), 2)
})

// The panel queued E01-E04 (field moved 1 -> 5), then E05-E08 (5 -> 9).
const steps = [
  { jobId: 'a', before: 1, after: 5 },
  { jobId: 'b', before: 5, after: 9 }
]

test('reconcileQueuedStart steps the field back when queued jobs are removed', () => {
  const both = [job('a', 1, 4), job('b', 5, 4)]
  const afterB = reconcileQueuedStart(9, steps, both, [job('a', 1, 4)])
  assert.deepEqual(afterB, { start: 5, steps: [steps[0]] })
  assert.deepEqual(reconcileQueuedStart(5, afterB.steps, [job('a', 1, 4)], []), { start: 1, steps: [] })
  // Both removed at once.
  assert.equal(reconcileQueuedStart(9, steps, both, []).start, 1)
})

test('reconcileQueuedStart keeps the field while the last queued job is still queued', () => {
  const both = [job('a', 1, 4), job('b', 5, 4)]
  assert.deepEqual(reconcileQueuedStart(9, steps, both, both), { start: 9, steps })
})

test('reconcileQueuedStart keeps a number the user typed', () => {
  const both = [job('a', 1, 4), job('b', 5, 4)]
  assert.deepEqual(reconcileQueuedStart(12, steps, both, [job('a', 1, 4)]), { start: 12, steps: [] })
})

test('reconcileQueuedStart keeps the numbers of a job that wrote episodes', () => {
  const done = [job('a', 1, 4), job('b', 5, 4, { status: 'done', outputs: ['/tv/e05.mp4'] })]
  // A finished job is cleared from the queue: its episodes exist, so the field stays.
  assert.deepEqual(reconcileQueuedStart(9, steps, done, [job('a', 1, 4)]), { start: 9, steps: [] })
  // Still listed and done: stop tracking, keep the field.
  assert.deepEqual(reconcileQueuedStart(9, steps, done, done), { start: 9, steps: [] })
})

test('reconcileQueuedStart moves to the first unwritten episode of a partial job', () => {
  const one = [{ jobId: 'a', before: 1, after: 5 }]
  // E01-E04 queued, E01 written, then the job failed (or was stopped).
  const failed = [job('a', 1, 4, { status: 'error', outputs: ['/tv/e01.mp4'] })]
  assert.deepEqual(reconcileQueuedStart(5, one, [job('a', 1, 4)], failed), { start: 2, steps: [] })
  // The same job removed after it failed.
  assert.deepEqual(reconcileQueuedStart(5, one, failed, []), { start: 2, steps: [] })
})

test('reconcileQueuedStart waits while the job is still running', () => {
  const one = [{ jobId: 'a', before: 1, after: 5 }]
  const running = [job('a', 1, 4, { status: 'running', outputs: ['/tv/e01.mp4'] })]
  assert.deepEqual(reconcileQueuedStart(5, one, [job('a', 1, 4)], running), { start: 5, steps: one })
})

test('queueAndRemember reports the queued job before it saves the settings', async () => {
  const order: string[] = []
  const api = {
    runExport: async (): Promise<ExportResult> => ({ ok: true, outputs: [] }),
    queueAdd: async () => [job('a', 1, 4)],
    getSettings: async (): Promise<AppSettings> => ({}),
    updateSettings: async () => {
      order.push('save')
      return {}
    }
  }
  await queueAndRemember(api, req, remember, (jobs) => order.push(`queued ${jobs[0].id}`))
  assert.deepEqual(order, ['queued a', 'save'])
})
