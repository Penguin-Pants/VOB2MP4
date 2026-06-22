import { execFile } from 'child_process'
import { promisify } from 'util'
import { dirname } from 'path'
import { binaryPath } from './ffmpeg'
import { parseProbe, type RawFfprobe } from './ffprobe'
import type { DvdTitle } from '../shared/types'

const execFileP = promisify(execFile)

const MAX_TITLES = 99
const MAX_CONSECUTIVE_MISSES = 3

/**
 * Probe a single DVD title via FFmpeg's dvdvideo demuxer.
 * `discRoot` is the directory that CONTAINS the VIDEO_TS folder.
 * Returns null if the title doesn't exist / can't be read.
 */
export async function probeDvdTitle(discRoot: string, title: number): Promise<DvdTitle | null> {
  const args = [
    '-hide_banner',
    '-v',
    'error',
    '-f',
    'dvdvideo',
    '-title',
    String(title),
    '-show_format',
    '-show_streams',
    '-show_chapters',
    '-of',
    'json',
    discRoot
  ]
  try {
    const { stdout } = await execFileP(binaryPath('ffprobe'), args, {
      maxBuffer: 32 * 1024 * 1024
    })
    const raw = JSON.parse(stdout) as RawFfprobe
    const probe = parseProbe(raw)
    if (!probe.durationSec && probe.streams.length === 0) return null
    return {
      id: title,
      durationSec: probe.durationSec ?? 0,
      frameRate: probe.frameRate,
      interlaced: probe.interlaced,
      chapterCount: probe.chapters.length,
      chapters: probe.chapters,
      streams: probe.streams
    }
  } catch {
    return null
  }
}

/**
 * Enumerate the readable titles in a VIDEO_TS structure.
 * `videoTsPath` points at the VIDEO_TS folder itself; the demuxer is given its
 * parent (the disc root). Titles are numbered from 1 and assumed contiguous, so
 * we stop after a few consecutive misses.
 */
export async function readDvdTitles(videoTsPath: string): Promise<DvdTitle[]> {
  const discRoot = dirname(videoTsPath)
  const titles: DvdTitle[] = []
  let misses = 0
  for (let t = 1; t <= MAX_TITLES; t++) {
    const title = await probeDvdTitle(discRoot, t)
    if (title) {
      titles.push(title)
      misses = 0
    } else if (++misses >= MAX_CONSECUTIVE_MISSES) {
      break
    }
  }
  return titles
}
