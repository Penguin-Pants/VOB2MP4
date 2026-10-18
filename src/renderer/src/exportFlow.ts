import type {
  AppSettings,
  ExportRequest,
  ExportResult,
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

/** Add to the queue; remember the settings only once the job is accepted. */
export async function queueAndRemember(
  api: ExportFlowApi,
  req: ExportRequest,
  remember: SettingsPatch
): Promise<void> {
  await api.queueAdd(req)
  void api.updateSettings(remember)
}

export interface QueueRemoveApi {
  queueRemove: (id: string) => Promise<QueueJobView[]>
  getSettings: () => Promise<AppSettings>
  updateSettings: (patch: SettingsPatch) => Promise<unknown>
}

/**
 * Remove a queued job. If the saved start episode still points just past
 * this job (nothing was added after it), give its numbers back, so the next
 * disc does not skip episodes that will never be exported.
 */
export async function removeQueuedJob(api: QueueRemoveApi, job: QueueJobView): Promise<void> {
  await api.queueRemove(job.id)
  const last = (await api.getSettings()).lastExport
  if (
    last &&
    last.showName === job.showName &&
    last.season === job.season &&
    last.startEpisode === nextStartEpisode(job.startEpisode, job.episodeCount)
  ) {
    void api.updateSettings({ lastExport: { startEpisode: job.startEpisode } })
  }
}
