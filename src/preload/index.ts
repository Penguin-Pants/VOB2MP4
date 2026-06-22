import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  ExportProgress,
  ExportRequest,
  ExportResult,
  FilmstripThumb,
  FrameResult,
  InspectResponse,
  PreviewSource,
  ProjectFile,
  QueueJobView,
  SettingsPatch
} from '../shared/types'

export interface AppInfo {
  appVersion: string
  electronVersion: string
  platform: string
  ffmpegBundled: boolean
  ffmpegVersion: string | null
}

const api = {
  /** App + bundled-engine status, shown in the UI. */
  getInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:info'),
  /** Open a folder picker; returns selected paths (empty if cancelled). */
  openFolder: (): Promise<string[]> => ipcRenderer.invoke('dialog:openFolder'),
  /** Open a multi-select .VOB file picker; returns paths (empty if cancelled). */
  openVobFiles: (): Promise<string[]> => ipcRenderer.invoke('dialog:openVobFiles'),
  /** Inspect a selection read-only and classify it (VIDEO_TS vs loose VOBs). */
  inspect: (paths: string[]): Promise<InspectResponse> =>
    ipcRenderer.invoke('input:inspect', paths),
  /** Extract one preview frame at a timeline position (seconds). */
  getFrame: (source: PreviewSource, timeSec: number, accurate: boolean): Promise<FrameResult> =>
    ipcRenderer.invoke('preview:frame', source, timeSec, accurate),
  /** Generate `count` evenly-spaced filmstrip thumbnails for the program. */
  getFilmstrip: (source: PreviewSource, count: number): Promise<FilmstripThumb[]> =>
    ipcRenderer.invoke('preview:filmstrip', source, count),
  /** Pick an output directory; returns the path or null if cancelled. */
  chooseOutputDir: (): Promise<string | null> => ipcRenderer.invoke('dialog:chooseOutputDir'),
  /** Run an export of all episode segments; resolves when finished. */
  runExport: (req: ExportRequest): Promise<ExportResult> => ipcRenderer.invoke('export:run', req),
  /** Subscribe to export progress events. Returns an unsubscribe function. */
  onExportProgress: (cb: (p: ExportProgress) => void): (() => void) => {
    const listener = (_e: unknown, p: ExportProgress): void => cb(p)
    ipcRenderer.on('export:progress', listener)
    return () => ipcRenderer.removeListener('export:progress', listener)
  },
  /** Add a configured program to the batch queue. */
  queueAdd: (req: ExportRequest): Promise<QueueJobView[]> => ipcRenderer.invoke('queue:add', req),
  /** Remove a job from the queue (ignored if it is running). */
  queueRemove: (id: string): Promise<QueueJobView[]> => ipcRenderer.invoke('queue:remove', id),
  /** Remove all finished/errored jobs. */
  queueClear: (): Promise<QueueJobView[]> => ipcRenderer.invoke('queue:clear'),
  /** Get the current queue snapshot. */
  queueList: (): Promise<QueueJobView[]> => ipcRenderer.invoke('queue:list'),
  /** Start processing the queue (unattended); returns the current snapshot. */
  queueRun: (): Promise<QueueJobView[]> => ipcRenderer.invoke('queue:run'),
  /** Subscribe to queue updates. Returns an unsubscribe function. */
  onQueueUpdate: (cb: (jobs: QueueJobView[]) => void): (() => void) => {
    const listener = (_e: unknown, jobs: QueueJobView[]): void => cb(jobs)
    ipcRenderer.on('queue:update', listener)
    return () => ipcRenderer.removeListener('queue:update', listener)
  },
  /** Read remembered settings. */
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  /** Persist a settings patch. */
  updateSettings: (patch: SettingsPatch): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:update', patch),
  /** Save the current setup as a project file (shows a save dialog). */
  saveProject: (project: ProjectFile): Promise<{ ok: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('project:save', project),
  /** Open a project file (shows an open dialog). */
  openProject: (): Promise<{ ok: boolean; project?: ProjectFile; error?: string }> =>
    ipcRenderer.invoke('project:open'),
  /** Scan for black frames; resolves with candidate split-point times. */
  scanBlackFrames: (source: PreviewSource, minBlackSec: number): Promise<number[]> =>
    ipcRenderer.invoke('scan:black', source, minBlackSec),
  /** Cancel an in-progress black-frame scan. */
  cancelScan: (): Promise<void> => ipcRenderer.invoke('scan:cancel'),
  /** Subscribe to scan progress (0..1). Returns an unsubscribe function. */
  onScanProgress: (cb: (fraction: number) => void): (() => void) => {
    const listener = (_e: unknown, f: number): void => cb(f)
    ipcRenderer.on('scan:progress', listener)
    return () => ipcRenderer.removeListener('scan:progress', listener)
  },
  /** Reveal a written file/folder in the OS file manager. */
  showItemInFolder: (path: string): Promise<void> => ipcRenderer.invoke('shell:showItem', path)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
