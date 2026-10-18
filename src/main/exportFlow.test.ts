import { test } from 'node:test'
import assert from 'node:assert/strict'
import { exportAndRemember, nextFreeEpisode, queueAndRemember } from '../renderer/src/exportFlow'
import type { AppSettings, ExportRequest, ExportResult, QueueJobView, SettingsPatch } from '../shared/types'

// One episode from E04, so the next start is E05.
const req = { naming: { showName: 'Show', season: 1, startEpisode: 4, outputDir: '/tv' } } as ExportRequest
const remember: SettingsPatch = { lastExport: { startEpisode: 5 } }

function fakeApi(result: ExportResult | Error) {
  const saved: SettingsPatch[] = []
  return {
    saved,
    api: {
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
