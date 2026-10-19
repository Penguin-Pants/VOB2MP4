/**
 * Plain-language reasons for failures the user sees. System error codes,
 * paths and video engine output stay out of the UI: they do not help the
 * user and can show internal details.
 */

/** An error whose message is already written for the user. */
export class UserError extends Error {}

const NOT_FOUND =
  'The file or folder is not there. It was moved or deleted, or its drive is disconnected. Reconnect the drive or choose it again.'
const NO_ACCESS =
  'Windows did not allow access to the file or folder. Make sure it is not read-only or open in another program, then try again.'
const BUSY = 'Another program is using the file. Close that program, then try again.'
const FULL = 'The drive is full. Free some space or choose another output folder, then try again.'
const READ_ONLY = 'The drive is read-only. Choose another output folder.'
const NOT_DIR = 'Part of the folder path is a file, not a folder. Choose another folder.'
const ENGINE_MISSING =
  'The video engine of VOB2MP4 is missing. Download the portable app again and use the new copy.'
const DAMAGED =
  'The video data could not be read. The source may be damaged or incomplete at this point. Check it in a video player, or rip the disc again.'
export const UNEXPECTED = 'An unexpected problem occurred. Try again. If it happens again, restart VOB2MP4.'

const BY_CODE: Record<string, string> = {
  ENOENT: NOT_FOUND,
  EACCES: NO_ACCESS,
  EPERM: NO_ACCESS,
  EBUSY: BUSY,
  ENOSPC: FULL,
  EROFS: READ_ONLY,
  ENOTDIR: NOT_DIR
}

/** The reason for a failed file operation or engine start, with a recovery step. */
export function plainReason(e: unknown): string {
  if (e instanceof UserError) return e.message
  const { code, syscall } = (e ?? {}) as NodeJS.ErrnoException
  // A failed spawn means the bundled engine is missing, not a user file.
  if (syscall?.startsWith('spawn')) return ENGINE_MISSING
  return (code && BY_CODE[code]) || UNEXPECTED
}

/** The reason for a failed video engine run, from its error output. */
export function videoReason(stderr: string): string {
  if (/No space left on device/i.test(stderr)) return FULL
  if (/Permission denied/i.test(stderr)) return NO_ACCESS
  if (/No such file or directory/i.test(stderr)) return NOT_FOUND
  return DAMAGED
}
