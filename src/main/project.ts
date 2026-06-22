import { dialog } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { sanitizeFilename } from '../shared/naming'
import type { ProjectFile } from '../shared/types'

const EXT = 'v2m'

/** Show a save dialog and write the project as JSON. Returns the saved path or null. */
export async function saveProject(project: ProjectFile): Promise<{ ok: boolean; path?: string; error?: string }> {
  const suggested = `${sanitizeFilename(project.naming.showName) || 'project'}.${EXT}`
  const res = await dialog.showSaveDialog({
    title: 'Save project',
    defaultPath: suggested,
    filters: [{ name: 'VOB2MP4 project', extensions: [EXT] }]
  })
  if (res.canceled || !res.filePath) return { ok: false }
  try {
    await writeFile(res.filePath, JSON.stringify(project, null, 2), 'utf8')
    return { ok: true, path: res.filePath }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Show an open dialog and read a project file. Returns the project or null. */
export async function openProject(): Promise<{ ok: boolean; project?: ProjectFile; error?: string }> {
  const res = await dialog.showOpenDialog({
    title: 'Open project',
    properties: ['openFile'],
    filters: [{ name: 'VOB2MP4 project', extensions: [EXT] }]
  })
  if (res.canceled || res.filePaths.length === 0) return { ok: false }
  try {
    const data = JSON.parse(await readFile(res.filePaths[0], 'utf8')) as ProjectFile
    if (data.version !== 1 || !data.source) return { ok: false, error: 'Not a valid project file.' }
    return { ok: true, project: data }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
