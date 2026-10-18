import type {
  ExportRequest,
  ExportResult,
  LastExportSettings,
  QueueJobView,
  SettingsPatch
} from '../../shared/types'
import { nextStartEpisode } from '../../shared/naming'

/** The part of window.api the export flows use (injectable for tests). */
export interface ExportFlowApi {
  runExport: (req: ExportRequest) => Promise<ExportResult>
  queueAdd: (req: ExportRequest) => Promise<QueueJobView[]>
  updateSettings: (patch: SettingsPatch) => Promise<unknown>
}

/**
 * Wait for the settings save. The settings only pre-fill the next disc, so a
 * failed save must not turn a finished export or an accepted job into an error.
 */
async function saveSettings(api: ExportFlowApi, patch: SettingsPatch): Promise<void> {
  await api.updateSettings(patch).catch(() => undefined)
}

/**
 * Export now. Remember the settings, with the start episode moved past the
 * episodes actually written: a refused export writes none and changes nothing.
 */
export async function exportAndRemember(
  api: ExportFlowApi,
  req: ExportRequest,
  remember: SettingsPatch
): Promise<ExportResult> {
  const res = await api.runExport(req)
  // Also after a partial failure: the episodes already written stay on disk,
  // so the next disc must start after them.
  if (res.outputs.length > 0) {
    const startEpisode = nextStartEpisode(req.naming.startEpisode, res.outputs.length)
    await saveSettings(api, { ...remember, lastExport: { ...remember.lastExport, startEpisode } })
  }
  return res
}

/**
 * Add to the queue and remember the settings once the job is accepted, but
 * with the job's own start episode, not the advanced one: the queue lives
 * only in memory, so its numbers are saved when a job finishes (main
 * process) and the pre-fill for the next disc comes from the live queue
 * (nextFreeEpisode).
 */
export async function queueAndRemember(
  api: ExportFlowApi,
  req: ExportRequest,
  remember: SettingsPatch
): Promise<void> {
  await api.queueAdd(req)
  await saveSettings(api, {
    ...remember,
    lastExport: { ...remember.lastExport, startEpisode: req.naming.startEpisode }
  })
}

/**
 * The start episode to pre-fill for the next disc: past the saved start and
 * past every queued, running or finished job of the same show and season.
 * Derived from the live queue each time, so removing jobs (in any order)
 * gives their numbers back by itself.
 */
export function nextFreeEpisode(
  saved: LastExportSettings | undefined,
  jobs: QueueJobView[]
): number | undefined {
  if (!saved) return undefined
  let next = saved.startEpisode
  for (const job of jobs) {
    if (job.showName !== saved.showName || job.season !== saved.season) continue
    // A failed job keeps only the episodes it wrote; others hold their range.
    const count = job.status === 'error' ? job.outputs.length : job.episodeCount
    if (count > 0) next = Math.max(next, nextStartEpisode(job.startEpisode, count))
  }
  return next
}
