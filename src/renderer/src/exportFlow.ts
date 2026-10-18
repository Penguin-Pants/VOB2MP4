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
 * Export now. Remember the settings (incl. the next start episode) only on
 * success: a refused or failed export must not skip episode numbers.
 */
export async function exportAndRemember(
  api: ExportFlowApi,
  req: ExportRequest,
  remember: SettingsPatch
): Promise<ExportResult> {
  const res = await api.runExport(req)
  if (res.ok) void api.updateSettings(remember)
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
  void api.updateSettings({
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
    if (job.status === 'error') continue
    if (job.showName !== saved.showName || job.season !== saved.season) continue
    next = Math.max(next, nextStartEpisode(job.startEpisode, job.episodeCount))
  }
  return next
}
