import { useEffect, useState } from 'react'

type AppInfo = Awaited<ReturnType<Window['api']['getInfo']>>

export default function App(): JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api
      .getInfo()
      .then(setInfo)
      .catch((e: unknown) => setError(String(e)))
  }, [])

  return (
    <div className="app">
      <header className="app__header">
        <h1>VOB2MP4</h1>
        <p className="app__tagline">Convert &amp; split DVD rips into per-episode MP4s</p>
      </header>

      <main className="app__main">
        <section className="card">
          <h2>Build pipeline check (Stage 0)</h2>
          {error && <p className="status status--bad">Error: {error}</p>}
          {!info && !error && <p className="status">Loading…</p>}
          {info && (
            <ul className="kv">
              <li>
                <span>App version</span>
                <code>{info.appVersion}</code>
              </li>
              <li>
                <span>Electron</span>
                <code>{info.electronVersion}</code>
              </li>
              <li>
                <span>Platform</span>
                <code>{info.platform}</code>
              </li>
              <li>
                <span>FFmpeg bundled</span>
                <code className={info.ffmpegBundled ? 'ok' : 'bad'}>
                  {info.ffmpegBundled ? 'yes' : 'no'}
                </code>
              </li>
              <li>
                <span>FFmpeg version</span>
                <code className={info.ffmpegVersion ? 'ok' : 'bad'}>
                  {info.ffmpegVersion ?? 'not found'}
                </code>
              </li>
            </ul>
          )}
        </section>

        <p className="app__note">
          This is the Stage 0 skeleton. If the window opens and FFmpeg shows a version, the full
          build pipeline works. Features (open disc, preview, split, export) come in later stages.
        </p>
      </main>
    </div>
  )
}
