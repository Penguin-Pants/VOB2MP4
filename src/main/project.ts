import { dialog } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { lastDir, rememberDir } from './settings'
import { sanitizeFilename } from '../shared/naming'
import type { ProjectFile } from '../shared/types'
import { plainReason } from '../shared/userError'

const EXT = 'v2m'
const NOT_A_PROJECT = 'This file is not a VOB2MP4 project, or it is damaged. Choose a .v2m file that VOB2MP4 saved.'

/** Show a save dialog and write the project as JSON. Returns the saved path or null. */
export async function saveProject(project: ProjectFile): Promise<{ ok: boolean; path?: string; error?: string }> {
  const suggested = `${sanitizeFilename(project.naming.showName) || 'project'}.${EXT}`
  const res = await dialog.showSaveDialog({
    title: 'Save project',
    defaultPath: join(lastDir('project') ?? '', suggested),
    filters: [{ name: 'VOB2MP4 project', extensions: [EXT] }]
  })
  if (res.canceled || !res.filePath) return { ok: false }
  rememberDir('project', dirname(res.filePath))
  try {
    await writeFile(res.filePath, JSON.stringify(project, null, 2), 'utf8')
    return { ok: true, path: res.filePath }
  } catch (e) {
    return { ok: false, error: plainReason(e) }
  }
}

/** Show an open dialog and read a project file. Returns the project or null. */
export async function openProject(): Promise<{ ok: boolean; project?: ProjectFile; error?: string }> {
  const res = await dialog.showOpenDialog({
    title: 'Open project',
    defaultPath: lastDir('project'),
    properties: ['openFile'],
    filters: [{ name: 'VOB2MP4 project', extensions: [EXT] }]
  })
  if (res.canceled || res.filePaths.length === 0) return { ok: false }
  rememberDir('project', dirname(res.filePaths[0]))
  try {
    const project = parseProject(await readFile(res.filePaths[0], 'utf8'))
    return project ? { ok: true, project } : { ok: false, error: NOT_A_PROJECT }
  } catch (e) {
    return { ok: false, error: plainReason(e) }
  }
}

/** The project in a .v2m file's text, or null if the text is not a VOB2MP4 project. */
export function parseProject(text: string): ProjectFile | null {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  const project = data as Partial<ProjectFile> | null
  return typeof project === 'object' && project?.version === 1 && project.source ? (project as ProjectFile) : null
}
