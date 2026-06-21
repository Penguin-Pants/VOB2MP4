import { useState } from 'react'
import type { InspectedInput } from '../../shared/types'
import { Tracks } from './Tracks'
import { formatBytes, formatDuration } from './format'

export function InputView({ input }: { input: InspectedInput }): JSX.Element {
  if (input.kind === 'video_ts') return <VideoTsView input={input} />
  return <VobFilesView input={input} />
}

function VideoTsView({ input }: { input: Extract<InspectedInput, { kind: 'video_ts' }> }): JSX.Element {
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
          <h4>Title #{selected.id} tracks</h4>
          <Tracks streams={selected.streams} />
        </div>
      )}
    </div>
  )
}

function VobFilesView({ input }: { input: Extract<InspectedInput, { kind: 'vob_files' }> }): JSX.Element {
  return (
    <div>
      <p className="muted small">Loose VOB files · grouped into programs (no chapter data)</p>
      {input.groups.map((g) => (
        <div className="card card--nested" key={g.id}>
          <div className="group__head">
            <strong>{g.label}</strong>
            <span className="muted small">
              {formatDuration(g.probe.durationSec)} · {formatBytes(g.totalBytes)}
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
        </div>
      ))}
    </div>
  )
}
