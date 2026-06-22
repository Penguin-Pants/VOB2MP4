import { spawn } from 'child_process'
import { dirname } from 'path'
import { binaryPath } from './ffmpeg'
import type { FilmstripThumb, FrameResult, PreviewSource } from '../shared/types'

const PREVIEW_HEIGHT = 480
const THUMB_HEIGHT = 120

/**
 * Map a global timeline position (seconds) onto a specific file + local offset,
 * given each file's duration. Clamps to the available range. Pure / testable.
 */
export function locateInFiles(
  durations: number[],
  t: number
): { fileIndex: number; localSec: number } {
  if (durations.length === 0) return { fileIndex: 0, localSec: Math.max(0, t) }
  let remaining = Math.max(0, t)
  for (let i = 0; i < durations.length; i++) {
    const d = durations[i]
    if (remaining < d || i === durations.length - 1) {
      const maxLocal = Math.max(0, d - 0.05)
      return { fileIndex: i, localSec: Math.min(remaining, maxLocal) }
    }
    remaining -= d
  }
  return { fileIndex: durations.length - 1, localSec: 0 }
}

function runCapture(bin: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const out: Buffer[] = []
    const err: Buffer[] = []
    const proc = spawn(bin, args)
    proc.stdout.on('data', (d: Buffer) => out.push(d))
    proc.stderr.on('data', (d: Buffer) => err.push(d))
    proc.on('error', reject)
    proc.on('close', (code) => {
      const buf = Buffer.concat(out)
      if (code === 0 && buf.length > 0) resolve(buf)
      else reject(new Error(Buffer.concat(err).toString().trim() || `ffmpeg exit ${code}`))
    })
  })
}

/** Build ffmpeg args to grab one JPEG frame at `ss` from a single input. */
function frameArgs(
  inputArgs: string[],
  input: string,
  ss: number,
  accurate: boolean,
  height: number,
  correctAspect: boolean
): string[] {
  const vf = correctAspect
    ? `scale=ih*dar:ih,scale=-2:${height}:flags=bicubic`
    : `scale=-2:${height}:flags=bicubic`
  const args = ['-hide_banner', '-v', 'error']
  if (!accurate) args.push('-ss', ss.toFixed(3)) // fast input seek (keyframe)
  args.push(...inputArgs, '-i', input)
  if (accurate) args.push('-ss', ss.toFixed(3)) // accurate output seek (decode from start)
  args.push(
    '-frames:v',
    '1',
    '-an',
    '-sn',
    '-vf',
    vf,
    '-q:v',
    '4',
    '-f',
    'image2pipe',
    '-vcodec',
    'mjpeg',
    'pipe:1'
  )
  return args
}

function inputForSource(source: PreviewSource, t: number): { inputArgs: string[]; input: string; ss: number } {
  if (source.kind === 'files') {
    const { fileIndex, localSec } = locateInFiles(source.fileDurations, t)
    return { inputArgs: [], input: source.files[fileIndex], ss: localSec }
  }
  // dvd: seek within the title via the dvdvideo demuxer (disc root = parent of VIDEO_TS)
  return {
    inputArgs: ['-f', 'dvdvideo', '-title', String(source.title)],
    input: dirname(source.videoTsPath),
    ss: t
  }
}

async function extractBuf(
  source: PreviewSource,
  t: number,
  accurate: boolean,
  height: number
): Promise<Buffer> {
  const { inputArgs, input, ss } = inputForSource(source, t)
  const bin = binaryPath('ffmpeg')
  try {
    return await runCapture(bin, frameArgs(inputArgs, input, ss, accurate, height, true))
  } catch {
    // Fallback: some inputs reject the display-aspect filter expression.
    return await runCapture(bin, frameArgs(inputArgs, input, ss, accurate, height, false))
  }
}

function toDataUrl(buf: Buffer): string {
  return `data:image/jpeg;base64,${buf.toString('base64')}`
}

/** Extract a single preview frame at `timeSec`. */
export async function extractFrame(
  source: PreviewSource,
  timeSec: number,
  accurate: boolean
): Promise<FrameResult> {
  try {
    const buf = await extractBuf(source, timeSec, accurate, PREVIEW_HEIGHT)
    return { ok: true, dataUrl: toDataUrl(buf), timeSec }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Generate evenly-spaced thumbnails across the program for the filmstrip. */
export async function generateFilmstrip(
  source: PreviewSource,
  count: number
): Promise<FilmstripThumb[]> {
  const dur = source.durationSec
  if (!dur || count <= 0) return []
  const thumbs: FilmstripThumb[] = []
  for (let i = 0; i < count; i++) {
    const t = (dur * (i + 0.5)) / count
    try {
      const buf = await extractBuf(source, t, false, THUMB_HEIGHT)
      thumbs.push({ timeSec: t, dataUrl: toDataUrl(buf) })
    } catch {
      /* skip frames that fail to extract */
    }
  }
  return thumbs
}
