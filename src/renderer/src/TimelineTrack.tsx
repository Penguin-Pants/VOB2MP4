import { useRef, useState } from 'react'
import { clampSplitMove } from '../../shared/segments'

export function TimelineTrack({
  duration,
  timeSec,
  splitPoints,
  chapterStarts,
  onSeek,
  onDragSplit,
  onCommitSplit
}: {
  duration: number
  timeSec: number
  splitPoints: number[]
  chapterStarts?: number[]
  onSeek: (t: number) => void
  onDragSplit: (index: number, t: number) => void
  onCommitSplit: (index: number, t: number) => void
}): JSX.Element {
  const trackRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ index: number; t: number } | null>(null)

  const pct = (t: number): string => `${duration > 0 ? (t / duration) * 100 : 0}%`

  const xToTime = (clientX: number): number => {
    const el = trackRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0
    return Math.max(0, Math.min(ratio * duration, duration))
  }

  return (
    <div
      className="ttrack"
      ref={trackRef}
      onPointerDown={(e) => {
        // Click on empty track = seek (markers stop propagation themselves).
        if (e.target === trackRef.current) onSeek(xToTime(e.clientX))
      }}
    >
      {(chapterStarts ?? []).map((c, i) => (
        <div key={`ch-${i}`} className="ttrack__chapter" style={{ left: pct(c) }} title={`chapter`} />
      ))}

      <div className="ttrack__playhead" style={{ left: pct(timeSec) }} />

      {splitPoints.map((sp, index) => {
        const shown = drag && drag.index === index ? drag.t : sp
        return (
          <div
            key={index}
            className={`ttrack__split${drag?.index === index ? ' dragging' : ''}`}
            style={{ left: pct(shown) }}
            title={'drag to move'}
            onPointerDown={(e) => {
              e.stopPropagation()
              e.preventDefault()
              ;(e.target as Element).setPointerCapture(e.pointerId)
              setDrag({ index, t: sp })
            }}
            onPointerMove={(e) => {
              if (!drag || drag.index !== index) return
              const t = clampSplitMove(splitPoints, index, xToTime(e.clientX), duration)
              setDrag({ index, t })
              onDragSplit(index, t)
            }}
            onPointerUp={(e) => {
              if (!drag || drag.index !== index) return
              ;(e.target as Element).releasePointerCapture(e.pointerId)
              onCommitSplit(index, drag.t)
              setDrag(null)
            }}
          />
        )
      })}
    </div>
  )
}
