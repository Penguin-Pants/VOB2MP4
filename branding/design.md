# VOB2MP4 design specification: Claw Cut

**Authority:** supplied `dr-claw-brand-system.md`. **Approved concept:** 01 Claw Cut. **Target:** existing Electron 43, React 18 and TypeScript renderer. **Screens:** source import, title selection, preview/filmstrip, cut-point timeline, export panel and batch queue.

## 1. Product facts and design priority
Input: VIDEO_TS directories, loose VOB parts and supported standalone video. The renderer offers FFmpeg-generated frame preview, filmstrip thumbnail navigation, timeline cut handles, manual S shortcut and precise frame stepping, chapter proposals, black-frame scanning, export configuration and queue management. The tool is private and local. Feature-complete according to repository README but Windows/disc validation remains pending. Never imply it rips physical DVDs.

**Priority:** preserve precise scrubbing and cut-point visibility, readable timecodes and reliable job-state feedback. Branding cannot change frame computation, split positions, re-encoding or output naming.

## 2. Brand and files
Icon source `assets/source/icon-master.svg`; small variant `assets/source/icon-small.svg`; vector wordmark `assets/source/wordmark-master.svg`. PNG icon set and Windows ICO: `assets/exported`. Light/mono source versions: `assets/variants`. Film negative-space plus diagonal red blade. Do not use concept raster board as production art.

## 3. Parent vs product palette
Parent inherited (fixed): Villain Red `#E10606`, Shadow Black `#0B0B0B`, Charcoal `#111111`, Steel Gray `#4A4A4A`, Metallic Silver `#8F959C` and Highlight White `#EDEDED`. Product-specific: neutral layered surfaces plus brighter secondary/muted text, focus `#FF7373`, episode cut handle `#64D9C3`, chapter gray `#A4A9B0`, job running `#74BAFF`, success `#6DD6A0` and errors `#FF8585`. Tokens are defined in `theme/tokens.json` and `theme/tokens.css`. Do not use red for every button or for error and progress simultaneously.

## 4. Typography, rhythm and structure
Reuse current native Windows/system UI font stack (`Segoe UI`, system-ui). Avoid a new font dependency. Headline 24–28 px, section heading 16–20 px, buttons/body 14 px and supporting text 12–13 px, subject to accessibility settings. Numeric timecodes use tabular numbers and monospace where required. Spacing increments 4 px; panel radius 10 px; control radius 6 px; borders 1–2 px. UI must remain usable when resized. Preserve existing application architecture and JSX components.

## 5. Components and page-specific guidance
- `App.tsx`: simple dark header with small icon/name, one subdued queue entry and visible FFmpeg readiness in footer. Keep import buttons prominent and distinct. Existing `InputView` title-selection table remains functional.
- `Preview.tsx`: video frame on black; player timecodes above full-width scrub control. Keep frame-step controls and jump-to-time clearly grouped. Place filmstrip immediately adjacent to timeline if feasible without creating scrolling traps.
- `TimelineTrack.tsx`: playhead in signature red with head/dot; split handles in mint and triangular head, chapter markers thin silver/gray and selected interval indicated with soft panel contrast. Labels/timecodes supplement color. Preserve keyboard/pointer gesture support, bounds and normalization exactly as implemented.
- `ExportPanel.tsx`: compact grouped fields for mode, quality, season, episode start, folder, audio and subtitle. Preserve selected options and progress/error wording. Avoid icons as the only labels.
- `QueueView.tsx`: statuses **Queued**, **Running**, **Done**, **Error** appear as text. Running blue with bar, Done green with checkmark, Error warm red with error description and Queued neutral gray. Retain Stop, Clear finished and remove-job actions.
- Save/open project controls: preserve existing logic and distinguish from source import buttons.

## 6. Interaction and accessibility
Keyboard focus ring 2 px high-contrast coral, 2 px offset. Provide touch/pointer target equivalent to 28–36 px where density allows. Keep visible label or tooltip on split handles and screen-reader accessible labels. Minimum WCAG AA target: 4.5:1 for normal text, 3:1 for large text and visual UI indicators when applicable. Audit colors against actual paired surfaces. Do not require animation to convey processing; honor `prefers-reduced-motion`. Changes to focus behavior or timeline pointer handling require regression tests.

## 7. Responsive/Windows rules
Target Windows 10/11 portable exe. Check 100%, 125% and 150% DPI; narrow and wide window; high-contrast mode; taskbar/Explorer icons; keyboard-only navigation. `electron-builder.yml` currently has no explicit `win.icon`; integrate `build/icon.ico` and verify in a Windows CI portable package before claiming final compatibility. Exact paths can change only after repository audit.

## 8. Existing CSS strategy
Current `src/renderer/src/index.css` is flat CSS with `--bg`, `--panel`, `--panel2`, `--text`, `--muted`, `--accent`, `--ok` and `--bad`. Add semantic tokens without breaking selectors; map existing variables temporarily to new tokens, then migrate actual CSS references. Replace blue button defaults carefully: destructive is not automatically red, functional progress remains blue. Do not add MagicUI or a new styling framework.

## 9. Mockups and exceptions
`mockups/import.png`, `timeline.png`, `export.png` and `queue.png` are design proposals based on real component structures, with illustrative data only. `brand-family.png` intentionally uses labels instead of fabricated Clawdio/Margin logo art, since approved sibling raster assets were not incorporated in this package.

## 10. Correct/incorrect usage
Correct: cut-marker distinction, optional small icon, clear job states, accessible high contrast, precise timecode and original vector artwork. Incorrect: all-red UI, moving cut points for aesthetics, fabricated media-preview features, glows required for identification, unrelated code refactoring and untested Windows packaging claims.
