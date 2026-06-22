import { contextBridge, ipcRenderer } from 'electron'
import type { FilmstripThumb, FrameResult, InspectResponse, PreviewSource } from '../shared/types'

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
    ipcRenderer.invoke('preview:filmstrip', source, count)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
