import { mkdir, rename, rm, stat, writeFile } from 'fs/promises'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import { runFfmpeg } from './ffmpeg'
import { buildExportArgs } from './exportArgs'
import { segmentsFromSplits } from '../shared/segments'
import { episodeFileName, seasonFolderName } from '../shared/naming'
import type { ExportProgress, ExportRequest, ExportResult, PreviewSource } from '../shared/types'

/** Escape a path for a concat-demuxer list file entry. */
function concatLine(file: string): string {
  return `file '${file.replace(/'/g, "'\\''")}'`
}

/** ffmpeg input args + target for a DVD title (disc root = parent of VIDEO_TS). */
export function dvdInput(source: Extract<PreviewSource, { kind: 'dvd' }>): {
  inputArgs: string[]
  input: string
} {
  return {
    inputArgs: ['-f', 'dvdvideo', '-title', String(source.title)],
    input: dirname(source.videoTsPath)
  }
}

/** Resolve the ffmpeg input args + target for a source, writing a temp list if needed. */
export async function resolveInput(
  source: PreviewSource
): Promise<{ inputArgs: string[]; input: string; cleanup: () => Promise<void> }> {
  if (source.kind === 'dvd') {
    return { ...dvdInput(source), cleanup: async () => undefined }
  }
  // Single-file program: use the file directly. The concat demuxer mishandles
  // input seeking far from a keyframe (it drops the video stream), which is
  // common for H.264 .m4v/.mp4 files that have sparse keyframes.
  if (source.files.length === 1) {
    return { inputArgs: [], input: source.files[0], cleanup: async () => undefined }
  }
  // Multiple files (joined VOB parts): concat demuxer.
  const listPath = join(tmpdir(), `vob2mp4-concat-${Date.now()}.txt`)
  await writeFile(listPath, source.files.map(concatLine).join('\n'), 'utf8')
  return {
    inputArgs: ['-f', 'concat', '-safe', '0'],
    input: listPath,
    cleanup: async () => rm(listPath, { force: true })
  }
}

const CANCELLED = 'Export cancelled.'

/** Episode files reserved by exports running in this process (by reservationKey). */
const liveReservations = new Set<string>()

/**
 * The key a reserved path is tracked under. Windows file names are
 * case-insensitive, so "Show" and "show" are the same file there.
 */
export function reservationKey(path: string, platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? path.toLowerCase() : path
}

/**
 * Reserve an episode file as an empty placeholder ('wx' fails if it exists).
 * An empty file that no running export owns is a placeholder left by an
 * interrupted run (crash or kill), never a real episode, so it is reused.
 */
async function reserve(output: string): Promise<void> {
  // Claim the key before any await, so two exports in this process can never
  // both pass the checks below for the same file.
  const key = reservationKey(output)
  if (liveReservations.has(key)) throw Object.assign(new Error('reserved'), { code: 'EEXIST' })
  liveReservations.add(key)
  try {
    await writeFile(output, '', { flag: 'wx' })
  } catch (e) {
    const stale = (e as NodeJS.ErrnoException).code === 'EEXIST' && (await stat(output).catch(() => null))?.size === 0
    if (!stale) {
      liveReservations.delete(key)
      throw e
    }
  }
}

/** Where ffmpeg writes an episode until it is complete (see runExport). */
function partPath(output: string): string {
  return `${output}.part`
}

async function runOne(
  args: string[],
  durationSec: number,
  onFraction: (f: number) => void,
  signal?: AbortSignal
): Promise<void> {
  const run = runFfmpeg(args, (t) => {
    if (durationSec > 0) onFraction(Math.min(1, t / durationSec))
  })
  const abort = (): void => run.kill()
  signal?.addEventListener('abort', abort)
  if (signal?.aborted) run.kill()
  try {
    const { code, stderr } = await run.done
    // A run that finished before the abort landed keeps its episode.
    if (code !== 0) throw new Error(signal?.aborted ? CANCELLED : stderr.trim() || `ffmpeg exit ${code}`)
  } finally {
    signal?.removeEventListener('abort', abort)
  }
}

/**
 * Export every episode segment of one program to MP4, sequentially.
 * Calls `onProgress` with per-episode progress. Original inputs are never
 * modified. Returns the list of written files. Aborting `signal` stops the
 * running episode and skips the rest; unfinished episode files are removed.
 */
export function runExport(
  req: ExportRequest,
  onProgress: (p: ExportProgress) => void,
  signal?: AbortSignal
): Promise<ExportResult> {
  const run = exportProgram(req, onProgress, signal)
  activeExports.add(run)
  void run.finally(() => activeExports.delete(run))
  return run
}

const activeExports = new Set<Promise<ExportResult>>()

/** Resolves once every running export has finished, including its file cleanup. */
export async function waitForExports(): Promise<void> {
  await Promise.allSettled([...activeExports])
}

async function exportProgram(
  req: ExportRequest,
  onProgress: (p: ExportProgress) => void,
  signal?: AbortSignal
): Promise<ExportResult> {
  const { source, splitPoints, options, naming } = req
  const segments = segmentsFromSplits(splitPoints, source.durationSec)
  if (segments.length === 0) return { ok: false, outputs: [], error: 'No episodes to export.' }

  const seasonDir = join(naming.outputDir, seasonFolderName(naming.season))
  const outputs: string[] = []
  const reserved: string[] = []
  let cleanup = async (): Promise<void> => undefined

  // Always resolve with a result: a rejection would leave the UI and the
  // queue stuck in "running".
  try {
    const resolved = await resolveInput(source)
    cleanup = resolved.cleanup
    const { inputArgs, input } = resolved
    await mkdir(seasonDir, { recursive: true })
    // Never overwrite earlier work (e.g. the previous disc of the season).
    // Reserve every episode up front ('wx' fails if the file exists), so a
    // clash, also with a concurrent export, is found before any encoding.
    // ffmpeg's -y then only overwrites these placeholders.
    const names = segments.map((_, i) => episodeFileName(naming, i))
    for (const name of names) {
      const output = join(seasonDir, name)
      try {
        await reserve(output)
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
        return {
          ok: false,
          outputs,
          error: `${name} already exists in ${seasonDir}. Change the start episode or move the file.`
        }
      }
      reserved.push(output)
    }
    for (let i = 0; i < segments.length; i++) {
      if (signal?.aborted) return { ok: false, outputs, error: CANCELLED }
      const seg = segments[i]
      const name = names[i]
      const output = reserved[i]
      // Encode to a .part file and rename it when done: a crash or power loss
      // then leaves only the empty placeholder (reclaimed next time) and a
      // .part file, never a truncated episode under its real name.
      const args = buildExportArgs({
        inputArgs,
        input,
        startSec: seg.startSec,
        endSec: seg.endSec,
        output: partPath(output),
        options
      })
      onProgress({
        episodeIndex: i,
        totalEpisodes: segments.length,
        episodeName: name,
        fraction: 0,
        status: 'running'
      })
      try {
        await runOne(args, seg.endSec - seg.startSec, (fraction) =>
          onProgress({
            episodeIndex: i,
            totalEpisodes: segments.length,
            episodeName: name,
            fraction,
            status: 'running'
          }),
          signal
        )
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e)
        onProgress({
          episodeIndex: i,
          totalEpisodes: segments.length,
          episodeName: name,
          fraction: 0,
          status: 'error',
          error
        })
        if (signal?.aborted) return { ok: false, outputs, error: CANCELLED }
        return { ok: false, outputs, error: `Episode ${i + 1} (${name}) failed: ${error}` }
      }
      await rename(partPath(output), output)
      outputs.push(output)
      onProgress({
        episodeIndex: i,
        totalEpisodes: segments.length,
        episodeName: name,
        fraction: 1,
        status: 'done'
      })
    }
  } catch (e) {
    return { ok: false, outputs, error: e instanceof Error ? e.message : String(e) }
  } finally {
    // Remove every reserved episode that did not finish (failure, clash,
    // cancel or an early error), so no empty or truncated file is left for
    // a media server to index or to block the next export.
    for (const path of reserved) {
      await rm(partPath(path), { force: true }).catch(() => undefined)
      if (!outputs.includes(path)) await rm(path, { force: true }).catch(() => undefined)
      liveReservations.delete(reservationKey(path))
    }
    // The temp concat list is disposable: failing to delete it must not
    // turn a finished export into a rejection.
    await cleanup().catch(() => undefined)
  }

  return { ok: true, outputs }
}
