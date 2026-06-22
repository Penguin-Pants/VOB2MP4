import { stat, readdir } from 'fs/promises'
import { join, basename as pathBasename } from 'path'
import { probeFile } from './ffprobe'
import { readDvdTitles } from './dvd'
import { groupVobFiles, groupMediaFiles, isMediaFile, isVobFile, looksLikeVideoTs } from './input'
import type { InspectedInput, ProbeResult, VobGroupInspected, VobGroup } from '../shared/types'

/** List the VOB and standalone-media files directly inside a directory. */
async function listDirFiles(dir: string): Promise<{ vobs: string[]; media: string[] }> {
  const entries = await readdir(dir, { withFileTypes: true })
  const vobs: string[] = []
  const media: string[] = []
  for (const e of entries) {
    if (!e.isFile()) continue
    const full = join(dir, e.name)
    if (isVobFile(e.name)) vobs.push(full)
    else if (isMediaFile(e.name)) media.push(full)
  }
  return { vobs, media }
}

/** Build programs: VOB parts are joined by title set; media files stand alone. */
function buildGroups(vobs: string[], media: string[]): VobGroup[] {
  return [...groupVobFiles(vobs), ...groupMediaFiles(media)]
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

/** Probe a program group: streams/chapters from the first file, durations per file. */
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
      // A single unreadable file shouldn't break inspection of the whole group.
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
      interlaced: firstProbe?.interlaced ?? false,
      chapters: firstProbe?.chapters ?? [],
      streams: firstProbe?.streams ?? []
    }
  }
}

/**
 * Inspect a user selection (one or more files/folders) and classify it as a
 * VIDEO_TS disc (with titles/chapters) or a set of file-based programs
 * (joined VOB parts and/or standalone media files like .m4v/.mp4).
 */
export async function inspectPaths(paths: string[]): Promise<InspectedInput> {
  if (paths.length === 0) throw new Error('Nothing selected.')

  // Single directory → a VIDEO_TS disc, or a folder of video files.
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
        // Fall back to treating the folder's files as programs.
        const { vobs, media } = await listDirFiles(videoTs)
        const groups = buildGroups(vobs, media)
        if (groups.length === 0) throw new Error('No video files found in that folder.')
        return { kind: 'vob_files', groups: await Promise.all(groups.map(inspectGroup)) }
      }
      const { vobs, media } = await listDirFiles(only)
      const groups = buildGroups(vobs, media)
      if (groups.length === 0) {
        throw new Error('No video files or VIDEO_TS found in that folder.')
      }
      return { kind: 'vob_files', groups: await Promise.all(groups.map(inspectGroup)) }
    }
    // A single file falls through to the collection block below.
  }

  // One or more files (and possibly dirs): collect and group them.
  const vobs: string[] = []
  const media: string[] = []
  for (const p of paths) {
    const info = await stat(p)
    if (info.isDirectory()) {
      const r = await listDirFiles(p)
      vobs.push(...r.vobs)
      media.push(...r.media)
    } else if (isVobFile(p)) {
      vobs.push(p)
    } else if (isMediaFile(p)) {
      media.push(p)
    }
  }
  const groups = buildGroups(vobs, media)
  if (groups.length === 0) throw new Error('No supported video files in the selection.')

  return { kind: 'vob_files', groups: await Promise.all(groups.map(inspectGroup)) }
}
