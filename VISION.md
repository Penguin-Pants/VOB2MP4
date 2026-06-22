# VOB2MP4 — Project Vision

> Status: **Implemented.** All seven build stages are complete and pushed (PR #1); each builds
> green on the Windows CI runner. Remaining: validation on real Windows hardware + DVD rips
> (GUI, DVD-title path, subtitle burn-in). This document is the single source of truth for what
> we are building. It is written so a fresh session can read it and understand the project 100%
> without re-asking the owner.

---

## 1. One-line summary

A **local Windows desktop application** that converts DVD rips (`.VOB` files / `VIDEO_TS` folders)
into **MP4** files, and **splits long single-file TV-series rips into individual episode MP4s** using a
built-in video player and timeline. Powered by **FFmpeg** under the hood.

## 2. The problem being solved

The owner has a large personal library of **DVD rips of TV series**. Each disc was ripped such that
**all episodes are concatenated into one long video** (spread across multiple `.VOB` chunks). The owner
needs to:
1. Convert the old DVD-format video (MPEG-2 in `.VOB`) into modern, compatible **MP4 (H.264)**.
2. **Cut that long video into one MP4 per episode**, with the cut points placed at custom locations.

## 3. Users & scope

- **Audience:** Just the owner. Personal tool, single Windows PC. Not for public release.
- **Implication:** Optimize for getting the library converted with minimal fuss. Keep packaging
  lightweight; spend effort on the core workflow, not on installers/polish/multi-user concerns.
- **Platform:** **Windows only** (Windows 10/11).

## 4. Inputs

The tool must accept **two kinds of input**:

1. **Raw `VIDEO_TS` folder** — a full DVD rip containing `VTS_xx_y.VOB` chunks plus `.IFO`/`.BUP`
   companion files. The `.IFO` files contain **title structure and chapter markers**.
2. **Loose `.VOB` files** — the owner selects one or more `.VOB` files directly. Most of the owner's
   **existing library is loose `.VOB` files with NO `.IFO` companions** (chapter data unavailable).

When multiple `.VOB` files make up one program, the tool **joins them in order** (sorted by filename,
e.g. `VTS_01_1.VOB`, `VTS_01_2.VOB`, `VTS_01_3.VOB`) into one continuous video before splitting.
The user can **reorder** the join sequence if the automatic sort is ever wrong.

### Title selection
A `VIDEO_TS` can contain multiple "titles" (main program, extras, menus, play-all vs. individual).
The tool **always shows a list of titles** (with duration / chapter count) and lets the user choose
which to work on.

## 5. Core workflow

1. **Open input** — pick a `VIDEO_TS` folder or select loose `.VOB` files.
2. **Choose title** (folder case) — pick from the listed titles.
3. **Join** chunks into one continuous video (in order; reorderable).
4. **Mark split points** — see "Splitting" below.
5. **Pick tracks** — choose audio track(s) to keep; optionally choose one subtitle track to burn in.
6. **Set output naming** — show name + season; episodes auto-number.
7. **Choose convert mode & quality preset.**
8. **Add to queue** — repeat for multiple discs.
9. **Run the queue unattended** (e.g. overnight); come back to finished episode MP4s.

## 6. Splitting (the heart of the app)

- Both methods are **always available**, chosen per file:
  - **Auto-detect from DVD chapters** — when a `VIDEO_TS` (with `.IFO`) is provided, the tool reads
    chapter markers and proposes episode split points on the timeline. The user can drag / add /
    delete them, then export. Chapter markers very often line up with episode boundaries.
  - **Fully manual** — the user scrubs the built-in video player and places split points by eye.
- **Important reality:** the owner's **loose-`.VOB` library has no `.IFO`**, so for those files
  **auto-chapter detection is unavailable/unreliable** and **manual marking is the primary path**.
  The visual player + timeline is therefore the most important, most-used surface. (Best-effort
  chapter detection from inside the VOB stream is a "nice if it works" bonus, not a guarantee.)
- Manual marking must be reasonably precise: basic scrubbing, jump-to-time, and frame-stepping so a
  cut lands where intended. (Fancy zoomable-timeline aids are not a priority unless needed.)

## 7. Conversion details

- **Engine:** FFmpeg (bundled with the app — the user installs nothing separately).
- **Convert mode is chosen per job:**
  - **Default: Re-encode to H.264** — smaller files, plays on virtually anything, **frame-accurate
    cuts**. Slower (~real-time) and a tiny, usually-invisible quality loss.
  - **Optional: Remux / stream copy** — very fast, lossless, but large MPEG-2 files, possible
    playback issues on some devices, and **cuts snap to the nearest keyframe** (can be off by a
    second or two).
- **DVD quirks handled automatically (both modes where applicable):**
  - **Deinterlacing** — DVD TV content is interlaced; deinterlace so motion is clean on modern displays.
  - **Aspect-ratio correction** — DVD is anamorphic (e.g. stored 720x480/576, displayed 4:3 or 16:9);
    correct it so nothing looks stretched.
- **Quality:** exposed as **simple presets** (e.g. High / Balanced / Smaller file). No knob soup.
- **Container/format:** `.mp4` output, H.264 video. (Audio codec default: keep compatible — decide in
  build, e.g. AAC, or pass-through where sensible.)

## 8. Audio

- The tool **lists the audio tracks** it finds in the selected title and the user **picks which
  track(s) to keep** per file.

## 9. Subtitles

- DVD subtitles are **image-based (bitmaps)**, which MP4 cannot carry cleanly.
- Decision: **burn one chosen subtitle track into the picture** (permanently visible) — or none —
  selected **per export**. The tool lists available subtitle tracks to choose from.

## 10. Output naming & organization

- **Media-server (Plex/Jellyfin/Emby) style.** The user sets a **show name** and **season number**;
  episode numbers **auto-increment**.
- Output filename pattern: `Show Name - S01E03.mp4`, organized into **Season folders**.

## 11. Batch / queue

- Set up multiple discs (split points, track choices, names, preset), add each to a **queue**, then
  **run unattended** in the background (e.g. overnight). User returns to finished episodes.
- Originals are **never modified or deleted** — no auto-cleanup, ever.

## 12. Optional conveniences (agreed IN scope)

- **Save split setup as a re-openable project** — stop midway, come back later without re-marking
  (split points, track choices, names, preset).
- **Remember last-used settings** — pre-fill next job with last preset, output folder, show/season.

### Optional conveniences considered but NOT prioritized
- Pre-batch "export a short test clip" preview.
- Advanced zoomable-timeline / power scrubbing aids beyond basic frame-step & jump-to-time.

## 13. Non-goals / out of scope

- No web app, no server, no uploading, no cloud processing.
- No accounts/auth, no multi-user.
- No OCR subtitle-to-text, no soft/selectable subtitles (burn-in only).
- No DVD *ripping* (the owner already rips discs); we start from existing `.VOB`/`VIDEO_TS`.
- No editing beyond cutting (no trimming filters, color, etc.) for v1.

## 14. Glossary (for future sessions)

- **VOB** — DVD video object file; an MPEG-2 program stream (video + AC-3/MP2 audio + bitmap subs).
  Often split into ~1 GB chunks (`VTS_01_1.VOB`, `VTS_01_2.VOB`, …).
- **VIDEO_TS** — the folder structure of a DVD rip; holds VOBs plus `.IFO`/`.BUP`.
- **IFO** — DVD info file describing titles, chapters, and stream layout. Holds **chapter markers**.
- **Title / PGC** — a playable program on the disc (main feature, extras, etc.).
- **Chapter marker** — timestamp bookmark within a title; often aligns with episode boundaries.
- **Anamorphic** — video stored at one pixel size but meant to display at a different aspect ratio.
- **Remux / stream copy** — repackage existing audio/video into a new container without re-encoding.
- **FFmpeg** — the open-source media engine that performs the actual decoding/encoding/cutting.

---

## 15. Technical Decisions (FINALIZED)

- **Form factor:** Local desktop application (not web, not pure CLI).
- **OS target:** Windows (10/11).
- **App framework:** **Electron** (web-tech desktop app), **TypeScript** + **React** UI.
- **Video engine:** **FFmpeg / ffprobe**, **bundled** (static Windows binary; GPL build with H.264
  encoder, deinterlace, subtitle burn-in). User installs nothing.
- **Video preview/scrubbing:** FFmpeg-driven **instant on-demand frame previews** + thumbnail
  filmstrip while scrubbing (avoids waiting on a full preview transcode). Smooth full-motion
  playback of a segment may use a quick temporary preview clip when needed.
- **DVD parsing:** `ffprobe` for tracks/duration on any file; **libdvdread-style reader (e.g.
  `lsdvd`)** for title list + chapter markers when a `VIDEO_TS` with `.IFO` is present. Loose VOBs:
  no chapters (expected); tracks/duration via ffprobe.
- **Local data storage:** plain **JSON files** in the app's user-data folder — `settings.json` plus
  one project file per saved disc. No database.
- **Backend / hosting / auth / DB-server / network:** **None** — fully local, offline, single user,
  private. No external services.
- **Packaging:** **electron-builder** producing a **portable `.exe`** (no install). Built reliably
  via **GitHub Actions on a Windows runner** (repo `penguin-pants/vob2mp4`), since development
  happens in a Linux environment. Downloadable build artifact each push.
- **Dev workflow:** Session-start hook to auto-install deps and enable checks in future web sessions.

### Build/test constraint to remember
Development happens on **Linux**; the target is a **Windows GUI** app. Application *logic* (FFmpeg
command building, DVD parsing, naming, queue, file I/O) can be unit-tested here, but the **Windows
GUI and actual VOB handling are verified by the owner** running the CI-produced portable `.exe`.
