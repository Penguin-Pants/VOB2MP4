# Drag-and-drop input: requirements

Status: decision-complete. Source: discovery session, 2026-10-19.

## Problem and desired outcome

- **Now:** input opens only through the picker buttons (`src/renderer/src/App.tsx:147-155`).
- **Goal:** the user drags a disc folder or video files from Explorer onto the start screen. The result is the same as the matching button.

## Requirements

### Accepted drops

- **R1.** A drop of one or more folders (a VIDEO_TS folder or a disc folder) opens them.
- **R2.** A drop of one or more `.VOB` files and/or video files (types in `MEDIA_EXTENSIONS`, `src/main/input.ts:34`) opens them.
- **R3.** A drop that mixes the items in R1 and R2 opens all of them. All paths go to the current `input:inspect` flow, which already groups mixed kinds (`src/main/inspect.ts:119-141`).

### Where drops work

- **Z1.** Drops work on the start screen only (the screen with the open buttons, with no loaded program and the queue closed).
- **Z2.** On the Preview screen and the queue screen, a drop does nothing. It does not load, navigate or replace anything.

### Behavior

- **B1.** A drop gives the same result as the buttons: "Inspecting…" status, then the program list or an error with the prefix "Could not open that selection."
- **B2.** A drop clears the current error before it starts, the same as `open()` (`src/renderer/src/App.tsx:93`).
- **B3.** A drop that opens input updates the remembered input folder with the same rule as the pickers (folder of the first path, `src/main/index.ts:72-90`). A `.v2m`-only drop (E1) opens no input and does not change it. Project folders use a separate remembered folder (`src/main/project.ts:21,39`).
- **B4.** While files are held over the start screen, a highlight shows (outline or overlay plus short text).

### Edge cases and failure behavior

- **E1.** A drop of only `.v2m` files shows a specific message that tells the user to use "Open project…".
- **E2.** A drop of `.v2m` files mixed with other items: the `.v2m` files are ignored and the other items open. The `.v2m` files do not change the remembered input folder (B3).
- **E3.** A drop of only unknown files shows the current inspect error (`src/main/inspect.ts:136-138`).
- **E4.** A drop while inspecting (busy) is ignored, the same as the disabled buttons.
- **E5.** A drop with no file paths (text, links, browser content) is ignored with no error.

### Constraints

- **C1.** Electron 43.8.0 has no `File.path`. Get paths in the preload with `webUtils.getPathForFile` (`node_modules/electron/electron.d.ts:19912`).
- **C2.** `contextIsolation: true` and `nodeIntegration: false` (`src/main/index.ts:40-42`). The renderer gets paths only through `window.api`.
- **C3.** The default window drop behavior is stopped on all screens, so a dropped file never loads into the window. Unverified assumption (Chromium default). Verify with `npm run dev` before the change.
- **C4.** Windows only (`VISION.md` §3).
- **C5.** TDD rules in `AGENTS.md`: unit tests for new pure logic.

## Acceptance criteria

- **AC1.** A dropped VIDEO_TS folder shows the same title list as "Open VIDEO_TS / folder…" for the same folder. (R1, B1)
- **AC2.** Dropped `.VOB` and video files show the same program list as the matching buttons. A mixed drop shows both kinds. (R2, R3, B1)
- **AC3.** A drop on the Preview screen or the queue screen changes nothing on screen and does not navigate the window. (Z2, C3)
- **AC4.** After a drop that opens input, the next input picker dialog opens at the folder of the first dropped path. After a `.v2m`-only drop, the remembered input folder does not change. (B3)
- **AC5.** The highlight shows while files are held over the start screen and goes away on leave or drop. (B4)
- **AC6.** A `.v2m`-only drop shows the E1 message. A mixed `.v2m` drop opens the other items. (E1, E2)
- **AC7.** A drop while "Inspecting…" shows starts no second inspect. A drop with no file paths shows no error. (E4, E5)
- **AC8.** An earlier error goes away when a new drop starts. Unknown-only files show the E3 error. (B2, E3)

## Non-goals

- Opening `.v2m` projects by drop.
- Drops on the Preview or queue screens.
- Drops from sources that give no file path.
- Changes to the picker buttons or to the inspect logic.

## Deferred ideas

- Open `.v2m` projects by drop.
- Drop on Preview with a "replace current program?" confirmation.

## Open questions

None.
