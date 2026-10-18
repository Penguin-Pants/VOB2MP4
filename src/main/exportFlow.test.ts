import { test } from 'node:test'
import assert from 'node:assert/strict'
import { exportAndRemember, queueAndRemember, removeQueuedJob } from '../renderer/src/exportFlow'
import type { AppSettings, ExportRequest, ExportResult, QueueJobView, SettingsPatch } from '../shared/types'

const req = {} as ExportRequest
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

test('queueAndRemember saves only after the job is accepted', async () => {
  const ok = fakeApi({ ok: true, outputs: [] })
  await queueAndRemember(ok.api, req, remember)
  assert.deepEqual(ok.saved, [remember])

  const failed = fakeApi(new Error('IPC failed'))
  await assert.rejects(queueAndRemember(failed.api, req, remember))
  assert.deepEqual(failed.saved, [])
})

const job: QueueJobView = {
  id: 'j1',
  label: 'Disc 2',
  showName: 'Show',
  season: 1,
  startEpisode: 5,
  episodeCount: 4,
  status: 'queued',
  fraction: 0,
  outputs: []
}

function queueApi(settings: AppSettings) {
  const saved: SettingsPatch[] = []
  const removed: string[] = []
  return {
    saved,
    removed,
    api: {
      queueRemove: async (id: string) => {
        removed.push(id)
        return []
      },
      getSettings: async () => settings,
      updateSettings: async (p: SettingsPatch) => {
        saved.push(p)
        return {}
      }
    }
  }
}

const lastExport = {
  mode: 'reencode' as const,
  preset: 'balanced' as const,
  outputDir: '/tv',
  showName: 'Show',
  season: 1
}

test('removeQueuedJob gives back the episode numbers the removed job had taken', async () => {
  // Adding the job moved the saved start from 5 to 9.
  const q = queueApi({ lastExport: { ...lastExport, startEpisode: 9 } })
  await removeQueuedJob(q.api, job)
  assert.deepEqual(q.removed, ['j1'])
  assert.deepEqual(q.saved, [{ lastExport: { startEpisode: 5 } }])
})

test('removeQueuedJob keeps the saved start when a later job already moved it', async () => {
  const q = queueApi({ lastExport: { ...lastExport, startEpisode: 13 } })
  await removeQueuedJob(q.api, job)
  assert.deepEqual(q.removed, ['j1'])
  assert.deepEqual(q.saved, [])
})
