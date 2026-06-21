import { contextBridge, ipcRenderer } from 'electron'

export interface AppInfo {
  appVersion: string
  electronVersion: string
  platform: string
  ffmpegBundled: boolean
  ffmpegVersion: string | null
}

const api = {
  /** App + bundled-engine status, shown in the UI. */
  getInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:info')
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
