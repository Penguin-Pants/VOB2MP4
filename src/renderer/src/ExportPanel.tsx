import { useState } from 'react'
import type {
  ConvertMode,
  ExportProgress,
  ExportRequest,
  ExportResult,
  MediaStreamInfo,
  PreviewSource,
  QualityPreset
} from '../../shared/types'
import { segmentsFromSplits } from '../../shared/segments'
import { episodeFileName, seasonFolderName } from '../../shared/naming'

function audioLabel(s: MediaStreamInfo): string {
  const ch = s.channelLayout ?? (s.channels ? `${s.channels}ch` : '')
  return `#${s.index} ${s.codec}${s.language ? ` (${s.language})` : ''}${ch ? ` · ${ch}` : ''}`
}
function subLabel(s: MediaStreamInfo): string {
  return `#${s.index} ${s.language ?? s.codec}`
}

export function ExportPanel({
  source,
  splitPoints
}: {
  source: PreviewSource
  splitPoints: number[]
}): JSX.Element {
  const audioStreams = source.streams.filter((s) => s.type === 'audio')
  const subtitleStreams = source.streams.filter((s) => s.type === 'subtitle')
  const segments = segmentsFromSplits(splitPoints, source.durationSec)

  const [showName, setShowName] = useState('')
  const [season, setSeason] = useState(1)
  const [startEpisode, setStartEpisode] = useState(1)
  const [outputDir, setOutputDir] = useState<string | null>(null)
  const [mode, setMode] = useState<ConvertMode>('reencode')
  const [preset, setPreset] = useState<QualityPreset>('balanced')
  const [deinterlace, setDeinterlace] = useState(true)
  const [audio, setAudio] = useState<number[]>(
    audioStreams.length > 0 ? [audioStreams[0].index] : []
  )
  const [burnSub, setBurnSub] = useState<number | null>(null)

  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState<ExportProgress | null>(null)
  const [result, setResult] = useState<ExportResult | null>(null)

  const naming = { showName, season, startEpisode, outputDir: outputDir ?? '' }
  const canExport = !exporting && showName.trim() !== '' && !!outputDir && segments.length > 0

  function toggleAudio(index: number): void {
    setAudio((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index].sort((a, b) => a - b)
    )
  }

  async function chooseFolder(): Promise<void> {
    const dir = await window.api.chooseOutputDir()
    if (dir) setOutputDir(dir)
  }

  async function doExport(): Promise<void> {
    if (!outputDir) return
    setExporting(true)
    setResult(null)
    setProgress(null)
    const unsub = window.api.onExportProgress(setProgress)
    const req: ExportRequest = {
      source,
      splitPoints,
      options: {
        mode,
        preset,
        deinterlace,
        audioStreamIndices: audio,
        burnSubtitleOrdinal: mode === 'copy' ? null : burnSub
      },
      naming: { showName: showName.trim(), season, startEpisode, outputDir }
    }
    const res = await window.api.runExport(req)
    unsub()
    setExporting(false)
    setProgress(null)
    setResult(res)
  }

  const overall = progress
    ? (progress.episodeIndex + progress.fraction) / progress.totalEpisodes
    : 0

  return (
    <div className="export card card--nested">
      <h4>Export episodes ({segments.length})</h4>

      <div className="export__grid">
        <label>
          Show name
          <input value={showName} onChange={(e) => setShowName(e.target.value)} placeholder="My Show" />
        </label>
        <label>
          Season
          <input
            type="number"
            min={0}
            value={season}
            onChange={(e) => setSeason(Number(e.target.value) || 0)}
          />
        </label>
        <label>
          Start at episode
          <input
            type="number"
            min={1}
            value={startEpisode}
            onChange={(e) => setStartEpisode(Number(e.target.value) || 1)}
          />
        </label>
      </div>

      <div className="export__row">
        <button className="ghost" onClick={chooseFolder}>
          Choose output folder…
        </button>
        <span className="muted small">{outputDir ?? 'no folder chosen'}</span>
      </div>

      <div className="export__row">
        <fieldset className="export__modes">
          <label>
            <input
              type="radio"
              checked={mode === 'reencode'}
              onChange={() => setMode('reencode')}
            />
            Re-encode H.264 (frame-accurate)
          </label>
          <label>
            <input type="radio" checked={mode === 'copy'} onChange={() => setMode('copy')} />
            Copy (fast, keyframe cuts)
          </label>
        </fieldset>
      </div>

      {mode === 'reencode' && (
        <div className="export__row">
          <label>
            Quality
            <select value={preset} onChange={(e) => setPreset(e.target.value as QualityPreset)}>
              <option value="high">High</option>
              <option value="balanced">Balanced</option>
              <option value="smaller">Smaller file</option>
            </select>
          </label>
          <label className="export__check">
            <input
              type="checkbox"
              checked={deinterlace}
              onChange={(e) => setDeinterlace(e.target.checked)}
            />
            Deinterlace
          </label>
        </div>
      )}

      <div className="export__row export__tracks">
        <div>
          <span className="muted small">Audio tracks</span>
          {audioStreams.length === 0 && <p className="muted small">none found</p>}
          {audioStreams.map((s) => (
            <label key={s.index} className="export__check">
              <input
                type="checkbox"
                checked={audio.includes(s.index)}
                onChange={() => toggleAudio(s.index)}
              />
              {audioLabel(s)}
            </label>
          ))}
        </div>
        <div>
          <span className="muted small">Burn-in subtitle</span>
          {mode === 'copy' ? (
            <p className="muted small">unavailable in copy mode</p>
          ) : subtitleStreams.length === 0 ? (
            <p className="muted small">none found</p>
          ) : (
            <select
              value={burnSub ?? ''}
              onChange={(e) => setBurnSub(e.target.value === '' ? null : Number(e.target.value))}
            >
              <option value="">None</option>
              {subtitleStreams.map((s, ordinal) => (
                <option key={s.index} value={ordinal}>
                  {subLabel(s)}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {segments.length > 0 && outputDir && showName.trim() !== '' && (
        <p className="muted small">
          → {seasonFolderName(season)}/{episodeFileName(naming, 0)}
          {segments.length > 1 && ` … ${episodeFileName(naming, segments.length - 1)}`}
        </p>
      )}

      <div className="export__row">
        <button onClick={doExport} disabled={!canExport}>
          {exporting ? 'Exporting…' : `Export ${segments.length} episode${segments.length === 1 ? '' : 's'}`}
        </button>
      </div>

      {progress && (
        <div className="export__progress">
          <div className="bar">
            <div className="bar__fill" style={{ width: `${Math.round(overall * 100)}%` }} />
          </div>
          <span className="muted small">
            Episode {progress.episodeIndex + 1}/{progress.totalEpisodes}: {progress.episodeName} (
            {Math.round(progress.fraction * 100)}%)
          </span>
        </div>
      )}

      {result && (
        <p className={result.ok ? 'ok small' : 'status--bad small'}>
          {result.ok
            ? `✓ Exported ${result.outputs.length} episode(s) to ${outputDir}`
            : `Export failed: ${result.error}`}
        </p>
      )}
    </div>
  )
}
