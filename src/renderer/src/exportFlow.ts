import type {
  AppSettings,
  ExportRequest,
  ExportResult,
  LastExportSettings,
  QueueJobView,
  SettingsPatch
} from '../../shared/types'
import { nextStartEpisode } from '../../shared/naming'

/** The part of window.api the export flows use (injectable for tests). */
export interface ExportFlowApi {
  getSettings: () => Promise<AppSettings>
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
    // The main process keeps the saved start from moving back (mergeSettings).
    const startEpisode = nextStartEpisode(req.naming.startEpisode, res.outputs.length)
    await saveSettings(api, { ...remember, lastExport: { ...remember.lastExport, startEpisode } })
  }
  return res
}

/** The saved start episode, if it belongs to the same show and season as `req`. */
async function savedStartFor(api: ExportFlowApi, req: ExportRequest): Promise<number | undefined> {
  const last = (await api.getSettings().catch((): AppSettings => ({}))).lastExport
  const sameShow = last?.showName === req.naming.showName && last?.season === req.naming.season
  return sameShow ? last.startEpisode : undefined
}

/**
 * Add to the queue and remember the settings once the job is accepted. The
 * queue lives only in memory, so a queued job never moves the saved start
 * forward: its numbers are saved when it finishes (main process) and the
 * pre-fill for the next disc comes from the live queue (nextFreeEpisode).
 * The saved start is kept for the same show and season, and resets to the
 * job start for another show or season.
 */
export async function queueAndRemember(
  api: ExportFlowApi,
  req: ExportRequest,
  remember: SettingsPatch,
  onQueued?: (jobs: QueueJobView[]) => void
): Promise<QueueJobView[]> {
  const jobs = await api.queueAdd(req)
  // Report the job at once, so a removal during the settings save is seen.
  onQueued?.(jobs)
  const startEpisode = (await savedStartFor(api, req)) ?? req.naming.startEpisode
  await saveSettings(api, { ...remember, lastExport: { ...remember.lastExport, startEpisode } })
  return jobs
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

/** A start-episode change the export panel made itself when it queued a job. */
export interface QueuedStep {
  jobId: string
  before: number
  after: number
}

/**
 * Step the panel's start episode back when the jobs it queued end without
 * writing all their episodes, latest job first: to the first unwritten
 * episode, or to the start before queueing if the job wrote nothing (for
 * example, it was removed). Stops (and forgets the steps) once the user typed
 * another number or a job wrote episodes, since those numbers are then
 * deliberate or used.
 */
export function reconcileQueuedStart(
  start: number,
  steps: QueuedStep[],
  prevJobs: QueueJobView[],
  jobs: QueueJobView[]
): { start: number; steps: QueuedStep[] } {
  const left = [...steps]
  while (left.length > 0) {
    const top = left[left.length - 1]
    const live = jobs.find((j) => j.id === top.jobId)
    if (live && (live.status === 'queued' || live.status === 'running')) break
    // A removed job is judged by how it looked last.
    const job = live ?? prevJobs.find((j) => j.id === top.jobId)
    if (job?.status === 'done' || start !== top.after) return { start, steps: [] }
    const written = job?.outputs.length ?? 0
    start = nextStartEpisode(top.before, written)
    if (written > 0) return { start, steps: [] }
    left.pop()
  }
  return { start, steps: left }
}
