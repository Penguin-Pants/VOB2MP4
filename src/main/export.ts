import { spawn } from 'child_process'
import { mkdir, writeFile, rm } from 'fs/promises'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import { binaryPath } from './ffmpeg'
import { buildExportArgs } from './exportArgs'
import { segmentsFromSplits } from '../shared/segments'
import { episodeFileName, seasonFolderName } from '../shared/naming'
import type { ExportProgress, ExportRequest, ExportResult, PreviewSource } from '../shared/types'

/** Escape a path for a concat-demuxer list file entry. */
function concatLine(file: string): string {
  return `file '${file.replace(/'/g, "'\\''")}'`
}

/** Resolve the ffmpeg input args + target for a source, writing a temp list if needed. */
export async function resolveInput(
  source: PreviewSource
): Promise<{ inputArgs: string[]; input: string; cleanup: () => Promise<void> }> {
  if (source.kind === 'dvd') {
    return {
      inputArgs: ['-f', 'dvdvideo', '-title', String(source.title)],
      input: dirname(source.videoTsPath),
      cleanup: async () => undefined
    }
  }
  const listPath = join(tmpdir(), `vob2mp4-concat-${Date.now()}.txt`)
  await writeFile(listPath, source.files.map(concatLine).join('\n'), 'utf8')
  return {
    inputArgs: ['-f', 'concat', '-safe', '0'],
    input: listPath,
    cleanup: async () => rm(listPath, { force: true })
  }
}

/** Parse an ffmpeg `out_time=HH:MM:SS.micros` value into seconds. */
function parseOutTime(line: string): number | null {
  const m = /out_time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(line)
  if (!m) return null
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
}

function runOne(
  args: string[],
  durationSec: number,
  onFraction: (f: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(binaryPath('ffmpeg'), args)
    let stdoutBuf = ''
    const errBuf: Buffer[] = []
    proc.stdout.on('data', (d: Buffer) => {
      stdoutBuf += d.toString()
      let nl: number
      while ((nl = stdoutBuf.indexOf('\n')) >= 0) {
        const line = stdoutBuf.slice(0, nl)
        stdoutBuf = stdoutBuf.slice(nl + 1)
        const t = parseOutTime(line)
        if (t != null && durationSec > 0) onFraction(Math.min(1, t / durationSec))
      }
    })
    proc.stderr.on('data', (d: Buffer) => errBuf.push(d))
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(Buffer.concat(errBuf).toString().trim() || `ffmpeg exit ${code}`))
    })
  })
}

/**
 * Export every episode segment of one program to MP4, sequentially.
 * Calls `onProgress` with per-episode progress. Original inputs are never
 * modified. Returns the list of written files.
 */
export async function runExport(
  req: ExportRequest,
  onProgress: (p: ExportProgress) => void
): Promise<ExportResult> {
  const { source, splitPoints, options, naming } = req
  const segments = segmentsFromSplits(splitPoints, source.durationSec)
  if (segments.length === 0) return { ok: false, outputs: [], error: 'No episodes to export.' }

  const seasonDir = join(naming.outputDir, seasonFolderName(naming.season))
  const outputs: string[] = []
  const { inputArgs, input, cleanup } = await resolveInput(source)

  try {
    await mkdir(seasonDir, { recursive: true })
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      const name = episodeFileName(naming, i)
      const output = join(seasonDir, name)
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
          })
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
  } finally {
    await cleanup()
  }

  return { ok: true, outputs }
}
