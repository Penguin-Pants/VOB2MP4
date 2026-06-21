import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { ffmpegVersion, binariesPresent } from './ffmpeg'
import { inspectPaths } from './inspect'
import type { InspectResponse } from '../shared/types'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'VOB2MP4',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  // Open external links in the user's browser, never inside the app.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// IPC: report app + engine status to the renderer (Stage 0 sanity surface).
ipcMain.handle('app:info', async () => {
  return {
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    platform: process.platform,
    ffmpegBundled: binariesPresent(),
    ffmpegVersion: await ffmpegVersion()
  }
})

// IPC: pick a DVD folder (VIDEO_TS or a folder of loose VOBs).
ipcMain.handle('dialog:openFolder', async (): Promise<string[]> => {
  const res = await dialog.showOpenDialog({
    title: 'Open a VIDEO_TS folder or a folder of VOB files',
    properties: ['openDirectory']
  })
  return res.canceled ? [] : res.filePaths
})

// IPC: pick one or more loose .VOB files.
ipcMain.handle('dialog:openVobFiles', async (): Promise<string[]> => {
  const res = await dialog.showOpenDialog({
    title: 'Select one or more .VOB files',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'DVD video', extensions: ['vob', 'VOB'] }]
  })
  return res.canceled ? [] : res.filePaths
})

// IPC: inspect a selection (read-only) and classify it.
ipcMain.handle('input:inspect', async (_e, paths: string[]): Promise<InspectResponse> => {
  try {
    const input = await inspectPaths(paths)
    return { ok: true, input }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
