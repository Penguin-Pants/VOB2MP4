import { randomUUID } from 'crypto'
import { BrowserWindow } from 'electron'
import { runExport } from './export'
import { segmentsFromSplits } from '../shared/segments'
import type { ExportProgress, ExportRequest, ExportResult, QueueJobView } from '../shared/types'

interface Job {
  id: string
  request: ExportRequest
  view: QueueJobView
}

const jobs: Job[] = []
let running = false
let stopRequested = false
let currentAbort: AbortController | null = null

function views(): QueueJobView[] {
  return jobs.map((j) => j.view)
}

function broadcast(): void {
  // Guarded so it's a no-op when there is no Electron runtime (e.g. tests).
  if (!BrowserWindow || typeof BrowserWindow.getAllWindows !== 'function') return
  const snapshot = views()
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('queue:update', snapshot)
  }
}

function makeView(id: string, request: ExportRequest): QueueJobView {
  const episodeCount = segmentsFromSplits(
    request.splitPoints,
    request.source.durationSec
  ).length
  return {
    id,
    label: request.source.label,
    showName: request.naming.showName,
    season: request.naming.season,
    startEpisode: request.naming.startEpisode,
    episodeCount,
    status: 'queued',
    fraction: 0,
    outputs: []
  }
}

export function addJob(request: ExportRequest): QueueJobView[] {
  const id = randomUUID()
  jobs.push({ id, request, view: makeView(id, request) })
  broadcast()
  return views()
}

export function removeJob(id: string): QueueJobView[] {
  const idx = jobs.findIndex((j) => j.id === id)
  if (idx >= 0 && jobs[idx].view.status !== 'running') jobs.splice(idx, 1)
  broadcast()
  return views()
}

export function clearFinished(): QueueJobView[] {
  for (let i = jobs.length - 1; i >= 0; i--) {
    const s = jobs[i].view.status
    if (s === 'done' || s === 'error') jobs.splice(i, 1)
  }
  broadcast()
  return views()
}

export function listJobs(): QueueJobView[] {
  return views()
}

/**
 * Process all queued jobs sequentially. Safe to call again; no-op if running.
 * `run` is injectable for tests.
 */
export async function runQueue(run: typeof runExport = runExport): Promise<void> {
  if (running) return
  running = true
  stopRequested = false
  try {
    // Look up the next queued job each time: jobs can be added or cleared
    // while one runs, so iterating the live array would skip entries.
    for (;;) {
      const job = jobs.find((j) => j.view.status === 'queued')
      if (!job || stopRequested) break
      job.view.status = 'running'
      job.view.fraction = 0
      broadcast()

      const abort = new AbortController()
      currentAbort = abort
      let res: ExportResult
      try {
        res = await run(
          job.request,
          (p: ExportProgress) => {
            job.view.currentEpisode = p.episodeIndex + 1
            job.view.currentEpisodeName = p.episodeName
            job.view.fraction = p.fraction
            broadcast()
          },
          abort.signal
        )
      } catch (e) {
        res = { ok: false, outputs: [], error: e instanceof Error ? e.message : String(e) }
      } finally {
        currentAbort = null
      }

      if (res.ok) {
        job.view.status = 'done'
        job.view.outputs = res.outputs
        job.view.fraction = 1
      } else {
        job.view.status = 'error'
        job.view.error = res.error
        job.view.outputs = res.outputs
      }
      broadcast()
    }
  } finally {
    running = false
    stopRequested = false
  }
}

/** Cancel the running job and don't start the next one. Later jobs stay queued. */
export function stopQueue(): QueueJobView[] {
  if (running) {
    stopRequested = true
    currentAbort?.abort()
  }
  return views()
}
