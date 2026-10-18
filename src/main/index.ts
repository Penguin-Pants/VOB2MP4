import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { ffmpegVersion, binariesPresent, killAllFfmpeg } from './ffmpeg'
import { inspectPaths } from './inspect'
import { MEDIA_EXTENSIONS } from './input'
import { cancelPreview, extractFrame, generateFilmstrip } from './preview'
import { runExport, waitForExports } from './export'
import { addJob, clearFinished, listJobs, removeJob, runQueue, stopQueue } from './queue'
import { getSettings, rememberCompletedExport, updateSettings } from './settings'
import { openProject, saveProject } from './project'
import { cancelScan, scanBlackFrames } from './scan'
import type {
  AppSettings,
  ExportRequest,
  ExportResult,
  FilmstripThumb,
  FrameResult,
  InspectResponse,
  PreviewSource,
  ProjectFile,
  QueueJobView,
  ScanResult,
  SettingsPatch
} from '../shared/types'

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

// IPC: pick one or more video files (.m4v/.mp4/…); each is its own program.
ipcMain.handle('dialog:openMediaFiles', async (): Promise<string[]> => {
  const res = await dialog.showOpenDialog({
    title: 'Select one or more video files (each is its own disc)',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Video files', extensions: [...MEDIA_EXTENSIONS] },
      { name: 'All files', extensions: ['*'] }
    ]
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

// IPC: extract a single preview frame at a timeline position.
ipcMain.handle(
  'preview:frame',
  (_e, source: PreviewSource, timeSec: number): Promise<FrameResult> =>
    extractFrame(source, timeSec)
)

// IPC: generate the timeline filmstrip thumbnails.
ipcMain.handle(
  'preview:filmstrip',
  (_e, source: PreviewSource, count: number): Promise<FilmstripThumb[]> =>
    generateFilmstrip(source, count)
)

// IPC: stop preview work when the preview closes or changes program.
ipcMain.handle('preview:cancel', (): void => cancelPreview())

// IPC: choose an output directory for exported episodes.
ipcMain.handle('dialog:chooseOutputDir', async (): Promise<string | null> => {
  const res = await dialog.showOpenDialog({
    title: 'Choose output folder (a Season folder is created inside)',
    properties: ['openDirectory', 'createDirectory']
  })
  return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0]
})

// IPC: run an export, streaming progress back to the requesting window.
let exportAbort: AbortController | null = null
ipcMain.handle('export:run', async (e, req: ExportRequest): Promise<ExportResult> => {
  // One direct export at a time, so Cancel always reaches the running one.
  if (exportAbort) return { ok: false, outputs: [], error: 'An export is already running.' }
  const abort = new AbortController()
  exportAbort = abort
  try {
    return await runExport(req, (p) => e.sender.send('export:progress', p), abort.signal)
  } finally {
    if (exportAbort === abort) exportAbort = null
  }
})
ipcMain.handle('export:cancel', (): void => exportAbort?.abort())

// IPC: batch queue management (updates broadcast via 'queue:update').
ipcMain.handle('queue:add', (_e, req: ExportRequest): QueueJobView[] => addJob(req))
ipcMain.handle('queue:remove', (_e, id: string): QueueJobView[] => removeJob(id))
ipcMain.handle('queue:clear', (): QueueJobView[] => clearFinished())
ipcMain.handle('queue:list', (): QueueJobView[] => listJobs())
ipcMain.handle('queue:run', (): QueueJobView[] => {
  // Save a job's episode numbers only once it finished: the queue lives in
  // memory, so numbers of jobs that never ran must not be used up.
  void runQueue(async (req, onProgress, signal) => {
    const res = await runExport(req, onProgress, signal)
    if (res.ok) rememberCompletedExport(req.naming, res.outputs.length)
    return res
  })
  return listJobs()
})
ipcMain.handle('queue:stop', (): QueueJobView[] => stopQueue())

// IPC: remembered settings.
ipcMain.handle('settings:get', (): AppSettings => getSettings())
ipcMain.handle('settings:update', (_e, patch: SettingsPatch): AppSettings =>
  updateSettings(patch)
)

// IPC: project save/open.
ipcMain.handle('project:save', (_e, project: ProjectFile) => saveProject(project))
ipcMain.handle('project:open', () => openProject())

// IPC: scan for black frames (scene breaks); progress via 'scan:progress'.
ipcMain.handle('scan:black', (e, source: PreviewSource, minBlackSec: number): Promise<ScanResult> =>
  scanBlackFrames(source, minBlackSec, (fraction) => e.sender.send('scan:progress', fraction))
)
ipcMain.handle('scan:cancel', (): void => cancelScan())

// IPC: reveal a file/folder in the OS file manager.
ipcMain.handle('shell:showItem', (_e, path: string): void => {
  if (path) shell.showItemInFolder(path)
})

// One app instance only: a second one could reclaim this one's episode
// placeholders (they look like stale leftovers to another process).
if (!app.requestSingleInstanceLock()) app.exit(0)
app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.focus()
})

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// On quit: stop all ffmpeg work, wait until the exports removed their
// unfinished episode files, then quit for real.
let readyToQuit = false
app.on('before-quit', (event) => {
  if (readyToQuit) return
  event.preventDefault()
  exportAbort?.abort()
  stopQueue()
  killAllFfmpeg()
  void waitForExports().finally(() => {
    readyToQuit = true
    app.quit()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
