import { useCallback, useEffect, useRef, useState } from 'react'
import type { FilmstripThumb, PreviewSource } from '../../shared/types'
import { formatDuration, parseTimecode } from './format'

const FILMSTRIP_COUNT = 16
const SCRUB_DEBOUNCE_MS = 90

export function Preview({
  source,
  onBack
}: {
  source: PreviewSource
  onBack: () => void
}): JSX.Element {
  const [timeSec, setTimeSec] = useState(0)
  const [frameUrl, setFrameUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filmstrip, setFilmstrip] = useState<FilmstripThumb[]>([])
  const [jumpText, setJumpText] = useState('')

  const reqToken = useRef(0)
  const scrubTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fps = source.frameRate && source.frameRate > 0 ? source.frameRate : 25
  const dur = source.durationSec

  const requestFrame = useCallback(
    async (t: number, accurate: boolean) => {
      const clamped = Math.max(0, Math.min(t, dur))
      const token = ++reqToken.current
      setLoading(true)
      const res = await window.api.getFrame(source, clamped, accurate)
      if (token !== reqToken.current) return // a newer request superseded this one
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

  // Load initial frame + filmstrip whenever the source changes.
  useEffect(() => {
    setTimeSec(0)
    setFrameUrl(null)
    setFilmstrip([])
    void requestFrame(0, true)
    window.api.getFilmstrip(source, FILMSTRIP_COUNT).then(setFilmstrip).catch(() => undefined)
  }, [source, requestFrame])

  /** Move to an exact time (accurate frame). */
  const goTo = useCallback(
    (t: number) => {
      const clamped = Math.max(0, Math.min(t, dur))
      setTimeSec(clamped)
      void requestFrame(clamped, true)
    },
    [dur, requestFrame]
  )

  /** Scrub handler: update time now, debounce a fast frame fetch. */
  const onScrub = (value: number): void => {
    setTimeSec(value)
    if (scrubTimer.current) clearTimeout(scrubTimer.current)
    scrubTimer.current = setTimeout(() => void requestFrame(value, false), SCRUB_DEBOUNCE_MS)
  }

  const step = (deltaSec: number): void => goTo(timeSec + deltaSec)

  const onJump = (): void => {
    const parsed = parseTimecode(jumpText)
    if (parsed != null) goTo(parsed)
  }

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
        {loading && <span className="muted small spinner"> · …</span>}
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
    </div>
  )
}
