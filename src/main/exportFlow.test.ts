import { test } from 'node:test'
import assert from 'node:assert/strict'
import { exportAndRemember, queueAndRemember } from '../renderer/src/exportFlow'
import type { ExportRequest, ExportResult, SettingsPatch } from '../shared/types'

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
