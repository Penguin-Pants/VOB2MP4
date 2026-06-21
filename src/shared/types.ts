// Shared data shapes used by the main process, preload, and renderer UI.
// IMPORTANT: keep this file free of any Node/Electron imports so it can be
// safely included in the browser (renderer) TypeScript program.

export interface MediaStreamInfo {
  /** ffprobe stream index within the file. */
  index: number
  type: 'video' | 'audio' | 'subtitle' | 'other'
  codec: string
  /** ISO language tag if present (e.g. "eng"). */
  language?: string
  channels?: number
  channelLayout?: string
  width?: number
  height?: number
  /** Human title/handler name if present. */
  title?: string
}

export interface ProbeResult {
  /** Total duration in seconds, or null if unknown. */
  durationSec: number | null
  streams: MediaStreamInfo[]
}

export type InputKind = 'video_ts' | 'vob_files'

/** A set of loose VOB files that together form one continuous program. */
export interface VobGroup {
  /** Stable id, e.g. "VTS_01" for a title set or "single:<basename>". */
  id: string
  /** Human-friendly label shown in the UI. */
  label: string
  /** Absolute file paths, already in the correct join order. */
  files: string[]
}

/** A loose-VOB group plus the probed media info for the joined program. */
export interface VobGroupInspected extends VobGroup {
  probe: ProbeResult
  /** Sum of file sizes in bytes (for display), if known. */
  totalBytes?: number
}

export interface DvdChapter {
  index: number
  startSec: number
  endSec: number
}

export interface DvdTitle {
  /** 1-based title number on the disc. */
  id: number
  durationSec: number
  chapterCount: number
  chapters: DvdChapter[]
  streams: MediaStreamInfo[]
}

export interface VideoTsInput {
  kind: 'video_ts'
  /** Path to the VIDEO_TS folder. */
  videoTsPath: string
  titles: DvdTitle[]
}

export interface VobFilesInput {
  kind: 'vob_files'
  groups: VobGroupInspected[]
}

export type InspectedInput = VideoTsInput | VobFilesInput

/** Returned by the inspect IPC call; either a result or a friendly error. */
export type InspectResponse =
  | { ok: true; input: InspectedInput }
  | { ok: false; error: string }
