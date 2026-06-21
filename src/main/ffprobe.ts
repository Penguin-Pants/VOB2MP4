import { execFile } from 'child_process'
import { promisify } from 'util'
import { binaryPath } from './ffmpeg'
import type { MediaStreamInfo, ProbeResult } from '../shared/types'

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
    tags?: Record<string, string>
  }>
  chapters?: Array<{
    id?: number
    start_time?: string
    end_time?: string
  }>
}

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

  return {
    durationSec: durationSec != null && Number.isFinite(durationSec) ? durationSec : null,
    streams
  }
}

/**
 * Run ffprobe on a single media file (e.g. one .VOB) and return typed info.
 * Reads format duration + all streams. Chapters are not expected for raw VOBs.
 */
export async function probeFile(file: string): Promise<ProbeResult> {
  const args = [
    '-hide_banner',
    '-v',
    'error',
    '-show_format',
    '-show_streams',
    '-of',
    'json',
    file
  ]
  const { stdout } = await execFileP(binaryPath('ffprobe'), args, {
    maxBuffer: 32 * 1024 * 1024
  })
  return parseProbe(JSON.parse(stdout) as RawFfprobe)
}
