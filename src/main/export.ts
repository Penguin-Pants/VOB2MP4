import { access, mkdir, writeFile, rm } from 'fs/promises'
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

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
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
 * running episode (its file is removed) and skips the rest.
 */
export async function runExport(
  req: ExportRequest,
  onProgress: (p: ExportProgress) => void,
  signal?: AbortSignal
): Promise<ExportResult> {
  const { source, splitPoints, options, naming } = req
  const segments = segmentsFromSplits(splitPoints, source.durationSec)
  if (segments.length === 0) return { ok: false, outputs: [], error: 'No episodes to export.' }

  const seasonDir = join(naming.outputDir, seasonFolderName(naming.season))
  const outputs: string[] = []
  let cleanup = async (): Promise<void> => undefined

  // Always resolve with a result: a rejection would leave the UI and the
  // queue stuck in "running".
  try {
    const resolved = await resolveInput(source)
    cleanup = resolved.cleanup
    const { inputArgs, input } = resolved
    await mkdir(seasonDir, { recursive: true })
    // Never overwrite earlier work (e.g. the previous disc of the season).
    // Check every episode first so nothing is encoded when one clashes.
    const names = segments.map((_, i) => episodeFileName(naming, i))
    for (const name of names) {
      if (await exists(join(seasonDir, name))) {
        return {
          ok: false,
          outputs,
          error: `${name} already exists in ${seasonDir}. Change the start episode or move the file.`
        }
      }
    }
    for (let i = 0; i < segments.length; i++) {
      if (signal?.aborted) return { ok: false, outputs, error: CANCELLED }
      const seg = segments[i]
      const name = names[i]
      const output = join(seasonDir, name)
      // Reserve the file atomically ('wx' fails if it exists). ffmpeg's -y
      // then only overwrites this placeholder, so a failed episode can be
      // deleted without touching anyone else's file.
      await writeFile(output, '', { flag: 'wx' })
      const args = buildExportArgs({
        inputArgs,
        input,
        startSec: seg.startSec,
        endSec: seg.endSec,
        output,
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
        // Don't leave a truncated episode for a media server to index.
        await rm(output, { force: true })
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
    await cleanup()
  }

  return { ok: true, outputs }
}
