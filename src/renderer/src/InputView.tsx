import { useState } from 'react'
import type { InspectedInput, PreviewSource } from '../../shared/types'
import { Tracks } from './Tracks'
import { formatBytes, formatDuration } from './format'

export function InputView({
  input,
  onLoad
}: {
  input: InspectedInput
  onLoad: (source: PreviewSource) => void
}): JSX.Element {
  if (input.kind === 'video_ts') return <VideoTsView input={input} onLoad={onLoad} />
  return <VobFilesView input={input} onLoad={onLoad} />
}

function VideoTsView({
  input,
  onLoad
}: {
  input: Extract<InspectedInput, { kind: 'video_ts' }>
  onLoad: (source: PreviewSource) => void
}): JSX.Element {
  // Default-select the longest title, but always show the full list to choose.
  const longest = input.titles.reduce(
    (best, t) => (t.durationSec > (best?.durationSec ?? -1) ? t : best),
    input.titles[0]
  )
  const [selectedId, setSelectedId] = useState<number>(longest?.id ?? 1)
  const selected = input.titles.find((t) => t.id === selectedId) ?? input.titles[0]

  return (
    <div>
      <p className="muted small">
        VIDEO_TS disc · <code>{input.videoTsPath}</code>
      </p>
      <h3>Titles ({input.titles.length})</h3>
      <table className="titles">
        <thead>
          <tr>
            <th></th>
            <th>Title</th>
            <th>Duration</th>
            <th>Chapters</th>
          </tr>
        </thead>
        <tbody>
          {input.titles.map((t) => (
            <tr
              key={t.id}
              className={t.id === selectedId ? 'sel' : ''}
              onClick={() => setSelectedId(t.id)}
            >
              <td>
                <input
                  type="radio"
                  name="title"
                  checked={t.id === selectedId}
                  onChange={() => setSelectedId(t.id)}
                />
              </td>
              <td>#{t.id}</td>
              <td>{formatDuration(t.durationSec)}</td>
              <td>{t.chapterCount}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {selected && (
        <div className="card card--nested">
          <div className="group__head">
            <h4>Title #{selected.id} tracks</h4>
            <button
              onClick={() =>
                onLoad({
                  kind: 'dvd',
                  label: `Title #${selected.id}`,
                  durationSec: selected.durationSec,
                  frameRate: selected.frameRate,
                  interlaced: selected.interlaced,
                  chapterStarts: selected.chapters.map((c) => c.startSec).filter((t) => t > 0),
                  streams: selected.streams,
                  videoTsPath: input.videoTsPath,
                  title: selected.id
                })
              }
            >
              Load in preview →
            </button>
          </div>
          <Tracks streams={selected.streams} />
        </div>
      )}
    </div>
  )
}

function VobFilesView({
  input,
  onLoad
}: {
  input: Extract<InspectedInput, { kind: 'vob_files' }>
  onLoad: (source: PreviewSource) => void
}): JSX.Element {
  return (
    <div>
      <p className="muted small">Programs · load one to preview, split, and export</p>
      {input.groups.map((g) => {
        const chapterCount = g.probe.chapters.length
        return (
          <div className="card card--nested" key={g.id}>
            <div className="group__head">
              <strong>{g.label}</strong>
              <span className="muted small">
                {formatDuration(g.probe.durationSec)} · {formatBytes(g.totalBytes)}
                {chapterCount > 0 && ` · ${chapterCount} chapters`}
                {g.probe.interlaced && ' · interlaced'}
              </span>
            </div>
            <ol className="files">
              {g.files.map((f) => (
                <li key={f}>
                  <code>{f}</code>
                </li>
              ))}
            </ol>
            <Tracks streams={g.probe.streams} />
            <div className="group__actions">
              <button
                onClick={() =>
                  onLoad({
                    kind: 'files',
                    label: g.label,
                    durationSec: g.probe.durationSec ?? 0,
                    frameRate: g.probe.frameRate,
                    interlaced: g.probe.interlaced,
                    chapterStarts: g.probe.chapters.map((c) => c.startSec).filter((t) => t > 0),
                    streams: g.probe.streams,
                    files: g.files,
                    fileDurations: g.fileDurations
                  })
                }
              >
                Load in preview →
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
