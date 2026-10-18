import type { ExportRequest, ExportResult, QueueJobView, SettingsPatch } from '../../shared/types'

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
