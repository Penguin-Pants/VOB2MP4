import { useCallback, useEffect, useRef, useState } from 'react'
import type { FilmstripThumb, PreviewSource } from '../../shared/types'
import { clampSplitMove, normalizeSplitPoints, segmentsFromSplits } from '../../shared/segments'
import { formatDuration, parseTimecode } from './format'
import { TimelineTrack } from './TimelineTrack'
import { ExportPanel, type ExportInitial } from './ExportPanel'

const FILMSTRIP_COUNT = 16
const SCRUB_DEBOUNCE_MS = 90

export function Preview({
  source,
  onBack,
  splitPoints,
  onSplitPointsChange,
  exportInitial,
  exportKey
}: {
  source: PreviewSource
  onBack: () => void
  splitPoints: number[]
  onSplitPointsChange: (points: number[]) => void
  exportInitial?: ExportInitial
  exportKey: string
}): JSX.Element {
  const [timeSec, setTimeSec] = useState(0)
  const [frameUrl, setFrameUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filmstrip, setFilmstrip] = useState<FilmstripThumb[]>([])
  const [jumpText, setJumpText] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanFrac, setScanFrac] = useState(0)
  const [scanMsg, setScanMsg] = useState<string | null>(null)

  const reqToken = useRef(0)
  const scrubTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fps = source.frameRate && source.frameRate > 0 ? source.frameRate : 25
  const dur = source.durationSec
  const chapterStarts = source.chapterStarts
  const segments = segmentsFromSplits(splitPoints, dur)

  const requestFrame = useCallback(
    async (t: number, accurate: boolean) => {
      const clamped = Math.max(0, Math.min(t, dur))
      const token = ++reqToken.current
      setLoading(true)
      const res = await window.api.getFrame(source, clamped, accurate)
      if (token !== reqToken.current) return
      setLoading(false)
      if (res.ok) {
        setFrameUrl(res.dataUrl)
        setError(null)
      } else {
        setError(res.error)
      }
    },
    [source, dur]
  )

  useEffect(() => {
    setTimeSec(0)
    setFrameUrl(null)
    setFilmstrip([])
    void requestFrame(0, true)
    window.api.getFilmstrip(source, FILMSTRIP_COUNT).then(setFilmstrip).catch(() => undefined)
  }, [source, requestFrame])

  const scheduleFastFrame = (t: number): void => {
    if (scrubTimer.current) clearTimeout(scrubTimer.current)
    scrubTimer.current = setTimeout(() => void requestFrame(t, false), SCRUB_DEBOUNCE_MS)
  }

  const goTo = useCallback(
    (t: number) => {
      const clamped = Math.max(0, Math.min(t, dur))
      setTimeSec(clamped)
      void requestFrame(clamped, true)
    },
    [dur, requestFrame]
  )

  const onScrub = (value: number): void => {
    setTimeSec(value)
    scheduleFastFrame(value)
  }

  const step = (deltaSec: number): void => goTo(timeSec + deltaSec)

  const onJump = (): void => {
    const parsed = parseTimecode(jumpText)
    if (parsed != null) goTo(parsed)
  }

  // --- split point editing ---
  const addSplit = (): void => onSplitPointsChange(normalizeSplitPoints([...splitPoints, timeSec], dur))
  const clearSplits = (): void => onSplitPointsChange([])
  const proposeFromChapters = (): void =>
    onSplitPointsChange(normalizeSplitPoints(chapterStarts ?? [], dur))
  const deleteSplit = (index: number): void =>
    onSplitPointsChange(splitPoints.filter((_, i) => i !== index))
  const setSplit = (index: number, t: number): void => {
    const clamped = clampSplitMove(splitPoints, index, t, dur)
    onSplitPointsChange(
      normalizeSplitPoints(
        splitPoints.map((v, i) => (i === index ? clamped : v)),
        dur
      )
    )
  }

  async function scanScenes(): Promise<void> {
    setScanning(true)
    setScanFrac(0)
    setScanMsg(null)
    const unsub = window.api.onScanProgress(setScanFrac)
    const candidates = await window.api.scanBlackFrames(source, 0.4)
    unsub()
    setScanning(false)
    if (candidates.length > 0) {
      onSplitPointsChange(normalizeSplitPoints([...splitPoints, ...candidates], dur))
      setScanMsg(`Found ${candidates.length} scene break(s)`)
    } else {
      setScanMsg('No black-frame scene breaks found')
    }
  }

  // Press "S" to add a split at the playhead (unless typing in a field).
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const tag = (document.activeElement?.tagName ?? '').toLowerCase()
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return
      if (e.key.toLowerCase() === 's') {
        onSplitPointsChange(normalizeSplitPoints([...splitPoints, timeSec], dur))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [splitPoints, timeSec, dur, onSplitPointsChange])

  return (
    <div className="preview">
      <div className="preview__bar">
        <button className="ghost" onClick={onBack}>
          ← Back
        </button>
        <strong className="preview__title">{source.label}</strong>
        <span className="muted small">
          {formatDuration(dur)} · {fps.toFixed(2)} fps
        </span>
      </div>

      {error && <p className="status--bad small">Frame error: {error}</p>}

      <div className="preview__stage">
        {frameUrl ? (
          <img className="preview__frame" src={frameUrl} alt="preview frame" />
        ) : (
          <div className="preview__frame preview__frame--empty">{loading ? 'Loading…' : ''}</div>
        )}
      </div>

      <div className="preview__time">
        <span>{formatDuration(timeSec)}</span>
        <span className="muted small"> / {formatDuration(dur)}</span>
        {loading && <span className="muted small"> · …</span>}
      </div>

      <input
        className="preview__scrub"
        type="range"
        min={0}
        max={dur}
        step={Math.max(0.01, 1 / fps)}
        value={timeSec}
        onChange={(e) => onScrub(Number(e.target.value))}
        onMouseUp={() => requestFrame(timeSec, true)}
        onKeyUp={() => requestFrame(timeSec, true)}
      />

      {filmstrip.length > 0 && (
        <div className="filmstrip">
          {filmstrip.map((thumb) => (
            <img
              key={thumb.timeSec}
              src={thumb.dataUrl}
              title={formatDuration(thumb.timeSec)}
              onClick={() => goTo(thumb.timeSec)}
              alt={formatDuration(thumb.timeSec)}
            />
          ))}
        </div>
      )}

      <TimelineTrack
        duration={dur}
        timeSec={timeSec}
        splitPoints={splitPoints}
        chapterStarts={chapterStarts}
        onSeek={(t) => goTo(t)}
        onDragSplit={(_i, t) => {
          setTimeSec(t)
          scheduleFastFrame(t)
        }}
        onCommitSplit={(i, t) => {
          setSplit(i, t)
          goTo(t)
        }}
      />

      <div className="preview__controls">
        <button className="ghost" onClick={() => step(-10)}>
          −10s
        </button>
        <button className="ghost" onClick={() => step(-1)}>
          −1s
        </button>
        <button className="ghost" onClick={() => step(-1 / fps)}>
          ◀ frame
        </button>
        <button className="ghost" onClick={() => step(1 / fps)}>
          frame ▶
        </button>
        <button className="ghost" onClick={() => step(1)}>
          +1s
        </button>
        <button className="ghost" onClick={() => step(10)}>
          +10s
        </button>
        <span className="preview__jump">
          <input
            type="text"
            placeholder="h:mm:ss"
            value={jumpText}
            onChange={(e) => setJumpText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onJump()
            }}
          />
          <button className="ghost" onClick={onJump}>
            Go
          </button>
        </span>
      </div>

      <div className="splits">
        <div className="splits__actions">
          <button onClick={addSplit}>✂ Split at playhead (S)</button>
          {(chapterStarts?.length ?? 0) > 0 && (
            <button className="ghost" onClick={proposeFromChapters}>
              Propose from chapters ({chapterStarts!.length})
            </button>
          )}
          {!scanning ? (
            <button className="ghost" onClick={scanScenes} title="Detect black frames as episode boundaries">
              🔍 Scan scene breaks
            </button>
          ) : (
            <>
              <span className="muted small">Scanning… {Math.round(scanFrac * 100)}%</span>
              <button className="ghost" onClick={() => void window.api.cancelScan()}>
                Cancel
              </button>
            </>
          )}
          {splitPoints.length > 0 && (
            <button className="ghost" onClick={clearSplits}>
              Clear splits
            </button>
          )}
          {scanMsg && <span className="muted small">{scanMsg}</span>}
        </div>

        <div className="splits__cols">
          <div>
            <h4>Split points ({splitPoints.length})</h4>
            {splitPoints.length === 0 ? (
              <p className="muted small">None yet — scrub to a boundary and click “Split”.</p>
            ) : (
              <ul className="splitlist">
                {splitPoints.map((sp, i) => (
                  <li key={i}>
                    <code>{formatDuration(sp)}</code>
                    <span className="splitlist__btns">
                      <button className="ghost" onClick={() => goTo(sp)} title="go to">
                        ▶
                      </button>
                      <button className="ghost" onClick={() => setSplit(i, sp - 1 / fps)} title="nudge back">
                        −f
                      </button>
                      <button className="ghost" onClick={() => setSplit(i, sp + 1 / fps)} title="nudge fwd">
                        +f
                      </button>
                      <button className="ghost" onClick={() => deleteSplit(i)} title="delete">
                        ✕
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h4>Episodes ({segments.length})</h4>
            <ul className="seglist">
              {segments.map((s) => (
                <li key={s.index}>
                  <span className="seglist__n">Ep {s.index + 1}</span>
                  <code>
                    {formatDuration(s.startSec)} → {formatDuration(s.endSec)}
                  </code>
                  <span className="muted small">({formatDuration(s.endSec - s.startSec)})</span>
                  <button className="ghost" onClick={() => goTo(s.startSec)} title="go to start">
                    ▶
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <ExportPanel key={exportKey} source={source} splitPoints={splitPoints} initial={exportInitial} />
    </div>
  )
}
