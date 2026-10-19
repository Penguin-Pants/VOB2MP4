# Claude Code: implement approved VOB2MP4 Claw Cut identity

You are implementing approved **Concept 01: Claw Cut** for `Penguin-Pants/VOB2MP4`. Work within the current repository; this folder is a drop-in **design-source package**, not permission to rewrite the app.

## Required reading and precedence
1. Repository `AGENTS.md` and `VISION.md`; honor instructions and scope.
2. Supplied authoritative `dr-claw-brand-system.md`.
3. This package `design.md`, `brand-guidelines.md` and `theme/tokens.json`.
4. Current `README.md`, `package.json`, `electron-builder.yml`, renderer source, tests and CI configuration.
5. Clawdio and Margin as examples only; never reuse their actual symbols.

## Work plan
1. Inspect current renderer and build assets. Confirm exact `App`, `InputView`, `Preview`, `TimelineTrack`, `ExportPanel`, `QueueView` and CSS paths. Check existing icons and packaging behavior.
2. Copy original SVG masters and PNG/ICO assets from `assets/` into repository-approved paths. Ensure `win.icon` in `electron-builder.yml` resolves to the real `.ico`, preferably `build/icon.ico` if repo structure permits. Update window branding where safe. Do not change `appId` or unrelated product metadata.
3. Integrate `theme/tokens.css` semantically in existing CSS, retaining backward-compatible variable aliases until selectors are migrated. Audit contrast for text, red on black, cyan/mint cut handles, progress, errors and focus states. No new component framework or MagicUI unless real technical evidence justifies it.
4. Apply design to real screens: import/title selection, frame preview, filmstrip, timeline, split list, export settings, queue and dialogs/status. Keep draggable cuts distinct from chapter proposals and playhead. Keep text status labels in queue. Handle small widths, 125%/150% DPI and reduced motion.
5. Preserve all behavior: importing VIDEO_TS/loose VOB/standalone videos; FFmpeg and ffprobe logic; chunk joining; chapter and black-frame proposals; split normalization/frame accuracy; keyboard shortcuts; save/load projects; track and quality selection; naming; queued processing and cancellation. No conversion or business-logic modifications.
6. Follow repository test workflow. Use Makefile targets if present; otherwise `npm run typecheck`, `npm test`, `npm run build` and `npm run build:win` in Windows environment with binaries installed. Examine available workflow in `.github/workflows/` and ensure packaged icon is actually embedded. Do not claim Windows validation from Linux alone.
7. Conduct review pass 1 for functionality, branding, contrast, accessibility and broken paths. Conduct review pass 2 to challenge all first-pass findings; fix confirmed regressions, re-run relevant checks and summarize remaining limitations.

## Acceptance criteria
- Original exported files exist at documented paths and SVG files contain actual vector geometry.
- Small icons readable at 16/32 px; Explorer/taskbar icons verified on real Windows if feasible.
- No lost controls or changed split/export behavior.
- Clear non-color queue states, visible focus, readable timecodes and reduced-motion support.
- Windows portable build succeeds where environment permits. No claim of on-device testing unless completed.
- Report changed paths, validation commands and results, screenshot/contrast review findings and outstanding Windows checks. State blocked conditions explicitly.

Do not generate placeholder assets, redraw concept boards or silently replace the approved identity.
