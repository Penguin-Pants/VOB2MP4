# VOB2MP4 / Claw Cut brand package

**Approved:** Concept 01, Claw Cut. **Status:** Design handoff assets, not merged into VOB2MP4.

Original SVG masters are in `assets/source`. PNG and ICO files are in `assets/exported`. Use `icon-small.svg` for the 16 px and 32 px variants. The mockups are **proposed designs**, not screenshots or verified Windows application output.

## Read first
- `design.md`: visual specification and mapping to current React structure.
- `brand-guidelines.md`: logo and family rules.
- `theme/tokens.json` and `theme/tokens.css`: semantic tokens.
- `implementation/claude-code-implementation-prompt.md`: integration instructions.

## Source evidence
Reviewed from `Penguin-Pants/VOB2MP4` default branch on 2026-10-19: `README.md`, `VISION.md`, `AGENTS.md`, `package.json`, `electron-builder.yml`, `src/renderer/src/App.tsx`, `Preview.tsx`, `QueueView.tsx`, `ExportPanel.tsx`, `index.css` and Clawdio/Margin design documents. Parent authority: attached `dr-claw-brand-system.md`.

## Windows icon
Recommended: copy `assets/exported/icon.ico` to `build/icon.ico` and set `win.icon: build/icon.ico` in `electron-builder.yml` after reviewing repository convention. Check the icon in File Explorer and Windows taskbar from a real Windows portable build. Packager behavior was not tested here.

## Boundaries
Do not change conversion, splitting, queue, media parsing or FFmpeg processing logic as part of branding. No source repo was modified. Source branding ZIP uses real raster and vector outputs, no empty placeholders.
