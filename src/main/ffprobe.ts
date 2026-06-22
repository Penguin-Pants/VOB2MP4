import { execFile } from 'child_process'
import { promisify } from 'util'
import { binaryPath } from './ffmpeg'
import type { DvdChapter, MediaStreamInfo, ProbeResult } from '../shared/types'

const execFileP = promisify(execFile)

/** Shape of the subset of `ffprobe -of json` output we rely on. */
export interface RawFfprobe {
  format?: { duration?: string }
  streams?: Array<{
    index?: number
    codec_type?: string
    codec_name?: string
    channels?: number
    channel_layout?: string
    width?: number
    height?: number
    r_frame_rate?: string
    avg_frame_rate?: string
    field_order?: string
    tags?: Record<string, string>
  }>
  chapters?: Array<{
    id?: number
    start_time?: string
    end_time?: string
  }>
}

/** Parse an ffprobe rational like "30000/1001" into fps, or null. */
export function parseFrameRate(value: string | undefined): number | null {
  if (!value || value === '0/0' || value === 'N/A') return null
  const [num, den] = value.split('/')
  const n = Number.parseFloat(num)
  const d = den != null ? Number.parseFloat(den) : 1
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null
  const fps = n / d
  return fps > 0 ? fps : null
}

function toSeconds(v: string | undefined): number {
  if (!v || v === 'N/A') return 0
  const n = Number.parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

/** Parse ffprobe chapters into our chapter shape. */
export function parseChapters(raw: RawFfprobe): DvdChapter[] {
  return (raw.chapters ?? []).map((c, i) => ({
    index: i + 1,
    startSec: toSeconds(c.start_time),
    endSec: toSeconds(c.end_time)
  }))
}

const INTERLACED_FIELD_ORDERS = new Set(['tt', 'bb', 'tb', 'bt'])

function streamType(codecType: string | undefined): MediaStreamInfo['type'] {
  switch (codecType) {
    case 'video':
    case 'audio':
    case 'subtitle':
      return codecType
    default:
      return 'other'
  }
}

/** Convert raw ffprobe JSON into our typed ProbeResult. Pure — easy to test. */
export function parseProbe(raw: RawFfprobe): ProbeResult {
  const durationSec =
    raw.format?.duration != null && raw.format.duration !== 'N/A'
      ? Number.parseFloat(raw.format.duration)
      : null

  const streams: MediaStreamInfo[] = (raw.streams ?? []).map((s, i) => {
    const tags = s.tags ?? {}
    return {
      index: s.index ?? i,
      type: streamType(s.codec_type),
      codec: s.codec_name ?? 'unknown',
      language: tags.language ?? tags.LANGUAGE,
      channels: s.channels,
      channelLayout: s.channel_layout,
      width: s.width,
      height: s.height,
      title: tags.title ?? tags.handler_name
    }
  })

  const video = (raw.streams ?? []).find((s) => s.codec_type === 'video')
  const frameRate = video
    ? parseFrameRate(video.r_frame_rate) ?? parseFrameRate(video.avg_frame_rate)
    : null
  const interlaced = video?.field_order != null && INTERLACED_FIELD_ORDERS.has(video.field_order)

  return {
    durationSec: durationSec != null && Number.isFinite(durationSec) ? durationSec : null,
    frameRate,
    interlaced,
    chapters: parseChapters(raw),
    streams
  }
}

/**
 * Run ffprobe on a single media file (.VOB, .m4v, .mp4, …) and return typed
 * info: format duration, streams, interlacing, and any embedded chapters.
 */
export async function probeFile(file: string): Promise<ProbeResult> {
  const args = [
    '-hide_banner',
    '-v',
    'error',
    '-show_format',
    '-show_streams',
    '-show_chapters',
    '-of',
    'json',
    file
  ]
  const { stdout } = await execFileP(binaryPath('ffprobe'), args, {
    maxBuffer: 32 * 1024 * 1024
  })
  return parseProbe(JSON.parse(stdout) as RawFfprobe)
}
