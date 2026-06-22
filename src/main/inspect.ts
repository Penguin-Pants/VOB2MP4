import { stat, readdir } from 'fs/promises'
import { join, basename as pathBasename } from 'path'
import { probeFile } from './ffprobe'
import { readDvdTitles } from './dvd'
import { groupVobFiles, looksLikeVideoTs } from './input'
import type {
  InspectedInput,
  ProbeResult,
  VobGroupInspected,
  VobGroup
} from '../shared/types'

/** Recursively does nothing fancy — just lists .VOB files directly in a dir. */
async function listVobsInDir(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  return entries
    .filter((e) => e.isFile() && /\.vob$/i.test(e.name))
    .map((e) => join(dir, e.name))
}

/** Locate the VIDEO_TS folder for a selected directory, or null. */
async function findVideoTsDir(dir: string): Promise<string | null> {
  if (pathBasename(dir).toUpperCase() === 'VIDEO_TS') return dir
  const entries = await readdir(dir, { withFileTypes: true })
  const names = entries.map((e) => e.name)
  const sub = entries.find((e) => e.isDirectory() && e.name.toUpperCase() === 'VIDEO_TS')
  if (sub) return join(dir, sub.name)
  // Directory itself directly holds the DVD files.
  if (looksLikeVideoTs(names)) return dir
  return null
}

/** Probe a loose-VOB group: streams from the first file, durations per file. */
async function inspectGroup(group: VobGroup): Promise<VobGroupInspected> {
  let firstProbe: ProbeResult | null = null
  let totalBytes = 0
  const fileDurations: number[] = []

  for (const file of group.files) {
    try {
      totalBytes += (await stat(file)).size
    } catch {
      /* size is best-effort */
    }
    try {
      const probe = await probeFile(file)
      if (!firstProbe) firstProbe = probe
      fileDurations.push(probe.durationSec ?? 0)
    } catch {
      // A single unreadable VOB shouldn't break inspection of the whole group.
      fileDurations.push(0)
    }
  }

  const durationSec = fileDurations.reduce((a, b) => a + b, 0)

  return {
    ...group,
    totalBytes,
    fileDurations,
    probe: {
      durationSec: durationSec || (firstProbe?.durationSec ?? null),
      frameRate: firstProbe?.frameRate ?? null,
      streams: firstProbe?.streams ?? []
    }
  }
}

/**
 * Inspect a user selection (one or more files/folders) and classify it as a
 * VIDEO_TS disc (with titles/chapters) or a set of loose VOB programs.
 */
export async function inspectPaths(paths: string[]): Promise<InspectedInput> {
  if (paths.length === 0) throw new Error('Nothing selected.')

  // Single directory → could be a VIDEO_TS disc or a folder of loose VOBs.
  if (paths.length === 1) {
    const only = paths[0]
    const info = await stat(only)
    if (info.isDirectory()) {
      const videoTs = await findVideoTsDir(only)
      if (videoTs) {
        const titles = await readDvdTitles(videoTs)
        if (titles.length > 0) {
          return { kind: 'video_ts', videoTsPath: videoTs, titles }
        }
        // Fall back to treating the VIDEO_TS folder's VOBs as loose files.
        const vobs = await listVobsInDir(videoTs)
        return {
          kind: 'vob_files',
          groups: await Promise.all(groupVobFiles(vobs).map(inspectGroup))
        }
      }
      const vobs = await listVobsInDir(only)
      if (vobs.length === 0) throw new Error('No .VOB files or VIDEO_TS found in that folder.')
      return {
        kind: 'vob_files',
        groups: await Promise.all(groupVobFiles(vobs).map(inspectGroup))
      }
    }
  }

  // One or more files (and possibly dirs): collect .VOB files and group them.
  const files: string[] = []
  for (const p of paths) {
    const info = await stat(p)
    if (info.isDirectory()) {
      files.push(...(await listVobsInDir(p)))
    } else if (/\.vob$/i.test(p)) {
      files.push(p)
    }
  }
  if (files.length === 0) throw new Error('No .VOB files in the selection.')

  return {
    kind: 'vob_files',
    groups: await Promise.all(groupVobFiles(files).map(inspectGroup))
  }
}
