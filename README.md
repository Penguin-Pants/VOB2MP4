# VOB2MP4

A local **Windows desktop app** that converts DVD rips (`.VOB` files / `VIDEO_TS` folders) **and
standalone video files (`.m4v`, `.mp4`, `.mkv`, …)** into **MP4** files, and **splits long
single-file TV-series rips into individual episode MP4s**, using a built-in video player and
timeline. Powered by **FFmpeg**, all processing is local, offline, and private.

Input handling:
- **VIDEO_TS folder** — lists titles + chapters.
- **Loose `.VOB` files** — joined into one program (DVD parts).
- **Video files (`.m4v`/`.mp4`/…)** — each file is treated as its own disc; embedded chapter
  markers are auto-detected for one-click split proposals, and interlacing is detected so
  deinterlacing only kicks in when needed.

See [`VISION.md`](./VISION.md) for the full project vision and the finalized technical decisions.

> **Status:** Feature-complete (Stages 0–7) plus standalone video-file input (`.m4v`/`.mp4`/…).
> Workflow: open a VIDEO_TS folder, loose VOBs, or video files → preview & scrub → mark split
> points (manual, chapters, or black-frame scan) → choose tracks / quality / naming → export, or
> queue many discs and run unattended. Save/reopen projects; last-used settings are remembered.
> Needs validation on real Windows hardware + discs.

## Branding

The UI uses the approved **Claw Cut** identity (Dr. Claw Development family). `branding/` is the
design source and stays unchanged. The app ships byte-identical copies:
`build/icon.ico`, `src/renderer/src/assets/icon-master.svg` and `src/renderer/src/tokens.css`.
`src/main/branding.test.ts` fails if a copy drifts from its source.

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

Requires Node 22.12+ (Electron 43 needs it). `npm run dev` / `npm run preview` download the
Electron binary on first run (Electron 42+ no longer does this at install time).

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
build/
  icon.ico   Windows app icon (copy of branding/assets/exported/icon.ico)
branding/    Approved Claw Cut design source (master SVGs, exports, tokens, mockups)
.github/workflows/
  build.yml  Builds the portable .exe on Windows
```
