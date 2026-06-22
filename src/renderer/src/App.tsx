import { useEffect, useState } from 'react'
import type { InspectedInput, PreviewSource } from '../../shared/types'
import { InputView } from './InputView'
import { Preview } from './Preview'

type AppInfo = Awaited<ReturnType<Window['api']['getInfo']>>

export default function App(): JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [input, setInput] = useState<InspectedInput | null>(null)
  const [source, setSource] = useState<PreviewSource | null>(null)
  const [splitPoints, setSplitPoints] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function loadSource(src: PreviewSource): void {
    setSplitPoints([])
    setSource(src)
  }

  useEffect(() => {
    window.api.getInfo().then(setInfo).catch(() => undefined)
  }, [])

  async function open(kind: 'folder' | 'files'): Promise<void> {
    setError(null)
    const paths =
      kind === 'folder' ? await window.api.openFolder() : await window.api.openVobFiles()
    if (paths.length === 0) return
    setBusy(true)
    setInput(null)
    try {
      const res = await window.api.inspect(paths)
      if (res.ok) setInput(res.input)
      else setError(res.error)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <header className="app__header">
        <h1>VOB2MP4</h1>
        <p className="app__tagline">Convert &amp; split DVD rips into per-episode MP4s</p>
      </header>

      <main className="app__main">
        {source ? (
          <Preview
            source={source}
            onBack={() => setSource(null)}
            splitPoints={splitPoints}
            onSplitPointsChange={setSplitPoints}
          />
        ) : (
          <>
            <section className="toolbar">
              <button onClick={() => open('folder')} disabled={busy}>
                Open VIDEO_TS / folder…
              </button>
              <button onClick={() => open('files')} disabled={busy}>
                Open VOB file(s)…
              </button>
              {busy && <span className="muted">Inspecting…</span>}
            </section>

            {error && <p className="status status--bad">Error: {error}</p>}

            {!input && !busy && !error && (
              <p className="muted">
                Open a <strong>VIDEO_TS folder</strong> (lists titles + chapters) or select
                <strong> loose .VOB files</strong> (grouped into programs) to see what&apos;s
                inside, then load a program to preview and scrub it.
              </p>
            )}

            {input && (
              <section className="card">
                <InputView input={input} onLoad={loadSource} />
              </section>
            )}
          </>
        )}
      </main>

      <footer className="app__footer muted small">
        {info ? (
          <>
            v{info.appVersion} · Electron {info.electronVersion} · FFmpeg{' '}
            <span className={info.ffmpegVersion ? 'ok' : 'bad'}>
              {info.ffmpegVersion ? 'ready' : 'not found'}
            </span>
          </>
        ) : (
          'starting…'
        )}
      </footer>
    </div>
  )
}
