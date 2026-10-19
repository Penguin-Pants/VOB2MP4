import { runFfmpeg, type FfmpegRun } from './ffmpeg'
import { dvdInput } from './export'
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

const SUPERSEDED = 'Superseded by a newer preview request.'

/**
 * Lets a newer request stop the ffmpeg run of an older one, so fast
 * scrubbing or switching programs never piles up decodes.
 */
class LatestOnly {
  private gen = 0
  private run: FfmpegRun | null = null

  /** Start a new request (cancelling the old one); returns its "still current" check. */
  begin(): () => boolean {
    this.run?.kill()
    this.run = null
    const gen = ++this.gen
    return () => gen === this.gen
  }

  async capture(args: string[], current: () => boolean): Promise<Buffer> {
    if (!current()) throw new Error(SUPERSEDED)
    const run = runFfmpeg(args)
    this.run = run
    try {
      const { code, stdout, stderr } = await run.done
      if (!current()) throw new Error(SUPERSEDED)
      if (code === 0 && stdout.length > 0) return stdout
      throw new Error(stderr.trim() || `ffmpeg exit ${code}`)
    } finally {
      if (this.run === run) this.run = null
    }
  }
}

const frameRequests = new LatestOnly()
const filmstripRequests = new LatestOnly()

/**
 * Build ffmpeg args to grab one JPEG frame at `ss` from a single input.
 * `-ss` goes before `-i`: ffmpeg seeks to the keyframe before `ss`, then
 * decodes and discards up to `ss` (accurate_seek is on by default), so the
 * frame is exact without decoding from the start of the file.
 */
export function frameArgs(
  inputArgs: string[],
  input: string,
  ss: number,
  height: number,
  correctAspect: boolean
): string[] {
  const vf = correctAspect
    ? `scale=ih*dar:ih,scale=-2:${height}:flags=bicubic`
    : `scale=-2:${height}:flags=bicubic`
  return [
    '-hide_banner',
    '-v',
    'error',
    '-ss',
    ss.toFixed(3),
    ...inputArgs,
    '-i',
    input,
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
  ]
}

function inputForSource(source: PreviewSource, t: number): { inputArgs: string[]; input: string; ss: number } {
  if (source.kind === 'files') {
    const { fileIndex, localSec } = locateInFiles(source.fileDurations, t)
    return { inputArgs: [], input: source.files[fileIndex], ss: localSec }
  }
  return { ...dvdInput(source), ss: t }
}

async function extractBuf(
  requests: LatestOnly,
  current: () => boolean,
  source: PreviewSource,
  t: number,
  height: number
): Promise<Buffer> {
  const { inputArgs, input, ss } = inputForSource(source, t)
  try {
    return await requests.capture(frameArgs(inputArgs, input, ss, height, true), current)
  } catch {
    // Fallback: some inputs reject the display-aspect filter expression.
    return await requests.capture(frameArgs(inputArgs, input, ss, height, false), current)
  }
}

function toDataUrl(buf: Buffer): string {
  return `data:image/jpeg;base64,${buf.toString('base64')}`
}

/** Extract a single preview frame at `timeSec`. A newer call cancels this one. */
export async function extractFrame(source: PreviewSource, timeSec: number): Promise<FrameResult> {
  const current = frameRequests.begin()
  try {
    const buf = await extractBuf(frameRequests, current, source, timeSec, PREVIEW_HEIGHT)
    return { ok: true, dataUrl: toDataUrl(buf), timeSec }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Generate evenly-spaced thumbnails across the program for the filmstrip.
 * A newer call (or cancelPreview) stops this one and returns what it has.
 */
export async function generateFilmstrip(
  source: PreviewSource,
  count: number
): Promise<FilmstripThumb[]> {
  const current = filmstripRequests.begin()
  const dur = source.durationSec
  if (!dur || count <= 0) return []
  const thumbs: FilmstripThumb[] = []
  for (let i = 0; i < count && current(); i++) {
    const t = (dur * (i + 0.5)) / count
    try {
      const buf = await extractBuf(filmstripRequests, current, source, t, THUMB_HEIGHT)
      thumbs.push({ timeSec: t, dataUrl: toDataUrl(buf) })
    } catch {
      /* skip frames that fail to extract */
    }
  }
  return current() ? thumbs : []
}

/** Stop any running preview frame or filmstrip work (e.g. the preview closed). */
export function cancelPreview(): void {
  frameRequests.begin()
  filmstripRequests.begin()
}
