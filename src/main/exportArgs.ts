import type { ExportOptions, QualityPreset } from '../shared/types'

const CRF: Record<QualityPreset, number> = {
  high: 18,
  balanced: 21,
  smaller: 24
}

/** Video filter chain: optional deinterlace + anamorphic→square-pixel scaling. */
export function videoFilterChain(options: ExportOptions): string {
  const parts: string[] = []
  if (options.deinterlace) parts.push('yadif')
  // Convert anamorphic DVD to square pixels at the correct display width (even).
  parts.push("scale='trunc(ih*dar/2)*2':ih", 'setsar=1')
  return parts.join(',')
}

export interface BuildExportArgsParams {
  /** Demuxer/input args before `-i` (e.g. concat or dvdvideo options). */
  inputArgs: string[]
  /** The input target (concat list path or DVD disc root). */
  input: string
  startSec: number
  endSec: number
  output: string
  options: ExportOptions
}

/**
 * Build the ffmpeg argument list to export one episode segment.
 *
 * Uses fast+accurate input seeking (`-ss` before `-i`, accurate_seek is on by
 * default) so the cut starts exactly at `startSec` without decoding from 0.
 * `-progress pipe:1` lets the caller track progress.
 */
export function buildExportArgs(p: BuildExportArgsParams): string[] {
  const { inputArgs, input, startSec, endSec, output, options } = p
  const duration = Math.max(0, endSec - startSec)

  const args = ['-hide_banner', '-v', 'error', '-y', '-progress', 'pipe:1', '-nostats']
  args.push('-ss', startSec.toFixed(3))
  args.push(...inputArgs, '-i', input)
  args.push('-t', duration.toFixed(3))

  if (options.mode === 'copy') {
    // Stream copy: fast + lossless, but cuts land on keyframes and no burn-in.
    args.push('-map', '0:v:0')
    for (const idx of options.audioStreamIndices) args.push('-map', `0:${idx}`)
    args.push('-c', 'copy', '-sn')
  } else {
    const vf = videoFilterChain(options)
    if (options.burnSubtitleOrdinal != null) {
      args.push(
        '-filter_complex',
        `[0:v:0][0:s:${options.burnSubtitleOrdinal}]overlay,${vf}[outv]`,
        '-map',
        '[outv]'
      )
    } else {
      args.push('-map', '0:v:0', '-vf', vf)
    }
    for (const idx of options.audioStreamIndices) args.push('-map', `0:${idx}`)
    args.push(
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      String(CRF[options.preset]),
      '-pix_fmt',
      'yuv420p'
    )
    if (options.audioStreamIndices.length > 0) args.push('-c:a', 'aac', '-b:a', '192k')
    args.push('-sn')
  }

  // Don't carry the source's chapter markers into each episode.
  args.push('-map_chapters', '-1')
  args.push('-movflags', '+faststart', output)
  return args
}
