# Drag-and-drop input: build plan

Source of truth: [`drag-drop-requirements.md`](./drag-drop-requirements.md). IDs (R, Z, B, E, C, AC) refer to that file.

## Approach

Reuse the current input flow. A drop gives a list of paths. The renderer sends the list to the current `input:inspect` IPC call, the same as the buttons. No new IPC channel, no new dependency, no data model change.

### Key decisions

1. **Paths in the preload.** Add one `window.api` function that maps dropped `File` objects to paths with `webUtils.getPathForFile` and drops empty results. (C1, C2, E5)
2. **Remember the folder in `input:inspect`.** The pickers and drops then share one rule. Delete `rememberPicked` and the copy of its logic in `dialog:openFolder` (`src/main/index.ts:72-90`). Both use `dirname(paths[0])` today, so picker behavior does not change. (B3, `AGENTS.md` Edits 4 and 6)
3. **One inspect function in `App.tsx`.** Split `open()` (`src/renderer/src/App.tsx:92-109`) into "get paths" and "inspect paths". The buttons and the drop both call the inspect part. (B1, B2, E3)
4. **Pure drop rule in a renderer module.** `src/renderer/src/drop.ts` decides: ignore, show the project message, or open. Tested from `src/main/`, the same as `exportFlow.ts` (`src/main/exportFlow.test.ts:3`). (E1, E2, E5)
5. **Window drop guard in the renderer.** One document-level `dragover`/`drop` handler that calls `preventDefault` on all screens. The start-screen zone handles its own drop. (Z2, C3)

### Repository evidence

| Item | Location |
| --- | --- |
| Picker buttons and `open()` | `src/renderer/src/App.tsx:92-155` |
| Inspect IPC handler | `src/main/index.ts:118-125` |
| Remember-folder logic | `src/main/index.ts:72-90`, `src/main/settings.ts:58` |
| Preload API | `src/preload/index.ts:24-104` (type from `typeof api`, `src/preload/index.d.ts`) |
| Mixed-path grouping | `src/main/inspect.ts:119-141` |
| Project file extension `v2m` | `src/main/project.ts:9` |
| Error copy catalog | `docs/error-messages.csv` |
| Test list | `package.json` `scripts.test` (explicit file list) |
| CI checks | `.github/workflows/build.yml`: `npm run typecheck`, `npm test` |
| Toolbar styles and tokens | `src/renderer/src/index.css:97-106`, `src/renderer/src/tokens.css` |

## Phases

### Phase 1: Paths reach the inspect flow, window ignores stray drops

**Goal**

The preload can turn dropped files into paths. `input:inspect` remembers the input folder. A drop anywhere in the window does nothing.

**Requirements covered**

B3, C1, C2, C3, Z2. AC3, AC4.

**Changes**

1. `src/preload/index.ts`: import `webUtils` from `electron`. Add a function (for example `pathsForFiles`) that takes the dropped files and returns their non-empty paths. Add a doc comment in the file's style.
2. `src/main/index.ts`:
   - In `input:inspect`, call `rememberDir('input', dirname(paths[0]))` when `paths[0]` exists, before `inspectPaths`.
   - Delete `rememberPicked`. Make the three input dialog handlers return `res.canceled ? [] : res.filePaths`.
3. `src/renderer/src/App.tsx`: in the existing mount `useEffect` (`App.tsx:86-90`), add document-level `dragover` and `drop` listeners that call `preventDefault`. Remove them on unmount.

**Implementation notes**

- Before change 3, run `npm run dev` and drop a `.mp4` onto the window. Record if the window navigates. This verifies C3. If it does not navigate, keep the guard anyway: it also stops the "copy" cursor on screens with no drop zone (Z2).
- Verify that `webUtils.getPathForFile` returns a path for a dropped **folder**. Electron docs do not state folder support. Unverified assumption. Check in the same `npm run dev` run with a temporary `console.log`, then remove it. If it fails, stop and report: R1 then needs another design.
- The picker still remembers the folder when inspect fails, because `rememberDir` runs before `inspectPaths`. This keeps current behavior.

**Tests**

- No new pure logic. `src/main/settings.test.ts:71` already covers `rememberDir`/`lastDir`.
- Run `npm run typecheck` and `npm test`. Both pass.

**Acceptance criteria**

1. `npm run typecheck` and `npm test` pass.
2. `rememberPicked` has zero references (`grep -n rememberPicked -r src`).
3. Manual: pick a disc with each button. The next dialog opens at the same folder as before the change.
4. Manual: drop a file on the start screen, the Preview screen and the queue screen. The window does not navigate and nothing changes. (AC3, start-screen handling comes in Phase 3)

**Dependencies**

None.

### Phase 2: Drop decision rule

**Goal**

A tested pure function decides what a drop does.

**Requirements covered**

E1, E2, E5, C5. AC6, AC7 (no-path part).

**Changes**

1. Create `src/main/drop.test.ts` first. Prove it fails on assertions against a stub.
2. Create `src/renderer/src/drop.ts`:
   - A function that takes the dropped paths and returns one of: `ignore` (no paths), `project` (every path ends in `.v2m`, case-insensitive), `open` (all paths, unchanged).
   - The E1 message as an exported constant, written in ASD-STE100. Example from the requirements: "Drop does not open projects. Use Open project…".
3. `package.json`: add `src/main/drop.test.ts` to `scripts.test`.

**Implementation notes**

- `open` passes all paths, including `.v2m` ones. `inspectPaths` already ignores unknown files (`src/main/inspect.ts:122-133`). This gives E2 with no extra filter.
- Define the `v2m` extension locally in `drop.ts`. The renderer cannot import `src/main/project.ts` (it imports Electron). Do not move `EXT`; one string does not justify a shared module.

**Tests**

| Case | Expected |
| --- | --- |
| Empty list | `ignore` (E5) |
| One `.v2m` | `project` (E1) |
| Two `.V2M` (upper case) | `project` (E1) |
| `.v2m` plus `.mp4` | `open` with both paths (E2) |
| Folder path, `.VOB`, `.mkv` | `open` with all paths, order kept (R1-R3) |
| Unknown file only (`notes.txt`) | `open` (E3 comes from inspect) |

**Acceptance criteria**

1. All cases in the table pass in `npm test`.
2. Each assertion fails when its rule is inverted (`AGENTS.md` Testing 3).

**Dependencies**

None. Can run in parallel with Phase 1.

### Phase 3: Start-screen drop zone

**Goal**

The user drops a folder or files on the start screen and gets the same result as the buttons, with a highlight while dragging.

**Requirements covered**

R1, R2, R3, Z1, B1, B2, B4, E1, E3, E4. AC1, AC2, AC5, AC6, AC7, AC8.

**Changes**

1. `src/renderer/src/App.tsx`:
   - Split `open()` into the picker part and an inspect function. The buttons and the drop both call the inspect function. Error text, prefix and `busy` handling stay the same.
   - Make the start-screen content (the fragment at `App.tsx:144-180`) the drop zone. Handle `dragenter`, `dragover`, `dragleave` and `drop`.
   - On drop: when `busy`, do nothing (E4). Else get paths through the Phase 1 preload function, apply the Phase 2 rule: `ignore` does nothing, `project` sets the E1 message as the error and does not change the remembered input folder (B3), `open` calls the inspect function.
   - Show the highlight only when the drag holds files (`dataTransfer.types` includes `Files`). Clear it on leave and on drop. Nested child elements must not make it flicker.
2. `src/renderer/src/index.css`: add the highlight style with existing tokens. Include visible text so the cue does not rely on color only.
3. `docs/error-messages.csv`: add a row for the E1 message with location, trigger, severity, message and status, in the format of the other rows.
4. `README.md:18`: add "drag a folder or files onto the start screen" to the workflow line.
5. `VISION.md` §5 step 1: add drag-and-drop as a second way to open input.

**Implementation notes**

- The drop zone stops propagation of its `drop` event or the Phase 1 document guard checks it. Either way, exactly one handler acts on a start-screen drop.
- A drop while the program list shows (start screen with `input` set) replaces the list, the same as a button.
- Keep the buttons as the keyboard path. Drag-and-drop adds a pointer path only.

**Tests**

- Unit: Phase 2 tests cover the decision rule. The App wiring has no unit test harness in this repo (no renderer test runner). Do not add one.
- Manual on Windows with `npm run dev` (synthetic drops in automation have no real paths, so `getPathForFile` returns empty):

| Check | Requirement |
| --- | --- |
| Drop a VIDEO_TS folder: same titles as the folder button | AC1 |
| Drop 3 VOB parts, then 2 `.mp4` files, then a mix | AC2 |
| Hold files over the start screen: highlight shows, leaves on exit and drop | AC5 |
| Drop one `.v2m`: E1 message. Drop `.v2m` plus `.mp4`: the `.mp4` opens | AC6 |
| Drop during "Inspecting…": no second inspect. Drop selected text: no error | AC7 |
| Cause an error, then drop a valid file: error goes away. Drop `notes.txt`: E3 error | AC8 |
| Drop on Preview and queue screens: nothing changes | AC3 |
| After a drop, open a picker: it starts at the dropped folder. After a `.v2m`-only drop, it does not change | AC4 |

**Acceptance criteria**

1. `npm run typecheck` and `npm test` pass.
2. Every manual check in the table passes and is recorded in the PR body.
3. The E1 row exists in `docs/error-messages.csv`.

**Dependencies**

Phase 1 and Phase 2.

## Cross-cutting work

| Concern | Owner | Note |
| --- | --- | --- |
| Security | Phase 1 | Paths come only from `webUtils` in the preload. No Node access in the renderer (C2). The paths go to the same `input:inspect` handler that picker paths use. |
| Accessibility | Phase 3 | Buttons stay the keyboard path. The cue has text. The E1 message uses the current `role="alert"` paragraph. |
| Compatibility | Phase 1 | Picker remember-folder behavior is the same after the refactor. Check with Phase 1 AC 3. |
| Documentation | Phase 3 | README, VISION, error catalog. |
| Cleanup | Phase 1 | Delete `rememberPicked`. |
| Rollout and rollback | None | Single-user portable app. Rollback is a git revert. |

## Traceability

| Requirement | Planned phase | Verification |
| --- | --- | --- |
| R1 | 3 (folder path check in 1) | AC1 manual |
| R2 | 3 | AC2 manual, Phase 2 unit |
| R3 | 3 | AC2 manual, Phase 2 unit |
| Z1 | 3 | AC5, AC1 manual |
| Z2 | 1 | AC3 manual |
| B1 | 3 | AC1, AC2 manual |
| B2 | 3 | AC8 manual |
| B3 | 1 | AC4 manual, `settings.test.ts:71` |
| B4 | 3 | AC5 manual |
| E1 | 2, 3 | Phase 2 unit, AC6 manual |
| E2 | 2 | Phase 2 unit, AC6 manual |
| E3 | 3 | AC8 manual (inspect message already tested in `inspect.test.ts`) |
| E4 | 3 | AC7 manual |
| E5 | 1, 2 | Phase 2 unit, AC7 manual |
| C1 | 1 | Typecheck, folder check in Phase 1 notes |
| C2 | 1 | Code review: no Node import in the renderer |
| C3 | 1 | Phase 1 pre-change check, AC3 |
| C4 | 3 | Manual checks run on Windows |
| C5 | 2 | `npm test` |

### Out of scope or deferred

- Opening `.v2m` projects by drop (non-goal, deferred).
- Drops on Preview or queue screens with a replace confirmation (deferred).
- Drops with no file path (ignored by E5, no further work).
- Renderer test runner or E2E drag tests (no requirement asks for them).

## Review log

Two-pass review of this plan. Confirmed issues and fixes:

1. **Pass 1, repository:** an early draft put the drop rule in `src/shared/` and imported `EXT` from `src/main/project.ts`. `project.ts` imports Electron, so the renderer cannot use it. Fix: local constant in `src/renderer/src/drop.ts` (Phase 2 notes).
2. **Pass 1, missing work:** the new test file must be added to the explicit list in `package.json` or CI skips it. Fix: Phase 2 change 3.
3. **Pass 1, missing requirement owner:** B3 had no owner when the drop called inspect directly. Fix: remember in `input:inspect` (decision 2).
4. **Pass 2, unverified assumption:** folder paths from `getPathForFile` are not documented. Fix: explicit check with a stop condition in Phase 1 notes.
5. **Pass 2, unverifiable criterion:** automated drag tests cannot give real paths. Fix: manual Windows checks mapped to each AC in Phase 3.

No work in this plan lacks a supporting requirement. No open product decisions.
