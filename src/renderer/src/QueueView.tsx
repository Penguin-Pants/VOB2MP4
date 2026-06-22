import type { QueueJobView } from '../../shared/types'

const STATUS_LABEL: Record<QueueJobView['status'], string> = {
  queued: 'Queued',
  running: 'Running',
  done: 'Done',
  error: 'Error'
}

export function QueueView({
  jobs,
  onBack
}: {
  jobs: QueueJobView[]
  onBack: () => void
}): JSX.Element {
  const anyQueued = jobs.some((j) => j.status === 'queued')
  const anyRunning = jobs.some((j) => j.status === 'running')
  const anyFinished = jobs.some((j) => j.status === 'done' || j.status === 'error')

  return (
    <div className="queue">
      <div className="preview__bar">
        <button className="ghost" onClick={onBack}>
          ← Back
        </button>
        <strong className="preview__title">Batch queue ({jobs.length})</strong>
        <button onClick={() => void window.api.queueRun()} disabled={!anyQueued || anyRunning}>
          {anyRunning ? 'Running…' : '▶ Run queue'}
        </button>
        {anyFinished && (
          <button className="ghost" onClick={() => void window.api.queueClear()}>
            Clear finished
          </button>
        )}
      </div>

      {jobs.length === 0 ? (
        <p className="muted">
          Queue is empty. Load a program, mark splits, set export options, and click
          “＋ Add to queue”. Then come back here and run them all unattended.
        </p>
      ) : (
        <ul className="queue__list">
          {jobs.map((j) => (
            <li key={j.id} className={`queue__job queue__job--${j.status}`}>
              <div className="queue__head">
                <span className={`badge badge--${j.status}`}>{STATUS_LABEL[j.status]}</span>
                <strong>
                  {j.showName || j.label} · S{String(j.season).padStart(2, '0')}
                </strong>
                <span className="muted small">{j.episodeCount} episodes</span>
                {j.status === 'queued' && (
                  <button
                    className="ghost queue__rm"
                    onClick={() => void window.api.queueRemove(j.id)}
                  >
                    ✕
                  </button>
                )}
              </div>

              {j.status === 'running' && (
                <div className="export__progress">
                  <div className="bar">
                    <div
                      className="bar__fill"
                      style={{
                        width: `${Math.round(
                          (((j.currentEpisode ?? 1) - 1 + j.fraction) / Math.max(1, j.episodeCount)) *
                            100
                        )}%`
                      }}
                    />
                  </div>
                  <span className="muted small">
                    Episode {j.currentEpisode ?? 1}/{j.episodeCount}: {j.currentEpisodeName ?? ''} (
                    {Math.round(j.fraction * 100)}%)
                  </span>
                </div>
              )}

              {j.status === 'done' && (
                <span className="ok small">✓ {j.outputs.length} file(s) written</span>
              )}
              {j.status === 'error' && <span className="status--bad small">{j.error}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
