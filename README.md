# VOB2MP4

A local **Windows desktop app** that converts DVD rips (`.VOB` files / `VIDEO_TS` folders) into
**MP4** files and **splits long single-file TV-series rips into individual episode MP4s**, using a
built-in video player and timeline. Powered by **FFmpeg**, all processing is local, offline, and
private.

See [`VISION.md`](./VISION.md) for the full project vision and the finalized technical decisions.

> **Status:** Feature-complete (Stages 0–7). Workflow: open a VIDEO_TS folder or loose VOBs →
> preview & scrub → mark split points (manual, chapters, or black-frame scan) → choose tracks /
> quality / naming → export, or queue many discs and run unattended. Save/reopen projects;
> last-used settings are remembered. Needs validation on real Windows hardware + discs.

## Tech stack

- **Electron + TypeScript + React** (built with `electron-vite`)
- **FFmpeg / ffprobe** — bundled (fetched at build time), not committed
- Packaged as a **portable `.exe`** via `electron-builder`, built on a **Windows runner** in GitHub
  Actions

## Getting the app

Every push builds a portable `.exe` in GitHub Actions. Open the **Actions** tab → latest
**"Build Windows portable"** run → download the **`VOB2MP4-portable`** artifact, unzip, and run the
`.exe`. No installation required.

## Development

Requires Node 22+.

```bash
npm install            # install dependencies
npm run fetch-ffmpeg   # download FFmpeg/ffprobe for your platform into resources/ffmpeg/
npm run dev            # launch the app in development (hot reload)
npm run typecheck      # type-check main, preload, and renderer
npm run build:win      # build a portable Windows .exe (run on Windows)
```

### Project layout

```
src/
  main/      Electron main process (app lifecycle, FFmpeg, IPC handlers)
  preload/   Secure bridge exposing a typed `window.api` to the UI
  renderer/  React UI (the window you see)
scripts/
  download-ffmpeg.mjs   Fetches static FFmpeg binaries for the current platform
resources/
  ffmpeg/    Bundled binaries land here (git-ignored)
.github/workflows/
  build.yml  Builds the portable .exe on Windows
```
