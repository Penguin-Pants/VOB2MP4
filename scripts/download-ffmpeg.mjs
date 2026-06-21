// Downloads static FFmpeg + ffprobe binaries for the CURRENT platform and places
// them in resources/ffmpeg/. Run automatically in CI (Windows runner) before
// packaging, and usable locally for development/testing.
//
// Source: BtbN/FFmpeg-Builds "latest" GPL builds (include libx264 + libass, which
// we need for H.264 encoding and burning subtitles into the picture).
//
// Zero npm dependencies: downloads via Node's https and extracts using system
// tools (PowerShell Expand-Archive on Windows, tar elsewhere).

import { existsSync, mkdirSync, rmSync, readdirSync, copyFileSync, chmodSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { tmpdir } from 'os'
import { createWriteStream } from 'fs'
import { execFileSync } from 'child_process'
import https from 'https'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const outDir = join(projectRoot, 'resources', 'ffmpeg')

const BASE = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest'

/** Pick the right release asset for this platform. */
function assetFor(platform) {
  switch (platform) {
    case 'win32':
      return { name: 'ffmpeg-master-latest-win64-gpl.zip', kind: 'zip', exe: '.exe' }
    case 'linux':
      return { name: 'ffmpeg-master-latest-linux64-gpl.tar.xz', kind: 'tar', exe: '' }
    default:
      throw new Error(
        `Unsupported platform for FFmpeg fetch: ${platform}. ` +
          `The Windows build is produced in CI; macOS is not a target.`
      )
  }
}

function download(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 10) return reject(new Error('Too many redirects'))
    https
      .get(url, { headers: { 'User-Agent': 'vob2mp4-build' } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          return resolve(download(res.headers.location, dest, redirects + 1))
        }
        if (res.statusCode !== 200) {
          res.resume()
          return reject(new Error(`Download failed (${res.statusCode}) for ${url}`))
        }
        const file = createWriteStream(dest)
        res.pipe(file)
        file.on('finish', () => file.close(() => resolve(dest)))
        file.on('error', reject)
      })
      .on('error', reject)
  })
}

function extract(archivePath, kind, destDir) {
  if (kind === 'zip') {
    // Prefer PowerShell on Windows; fall back to unzip elsewhere.
    if (process.platform === 'win32') {
      execFileSync(
        'powershell',
        ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${destDir}' -Force`],
        { stdio: 'inherit' }
      )
    } else {
      execFileSync('unzip', ['-q', '-o', archivePath, '-d', destDir], { stdio: 'inherit' })
    }
  } else {
    execFileSync('tar', ['-xf', archivePath, '-C', destDir], { stdio: 'inherit' })
  }
}

/** Find a named binary anywhere under dir (BtbN nests it in <release>/bin/). */
function findBinary(dir, fileName) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      const found = findBinary(full, fileName)
      if (found) return found
    } else if (entry.name === fileName) {
      return full
    }
  }
  return null
}

async function main() {
  const { name, kind, exe } = assetFor(process.platform)
  const ffmpegName = `ffmpeg${exe}`
  const ffprobeName = `ffprobe${exe}`

  if (existsSync(join(outDir, ffmpegName)) && existsSync(join(outDir, ffprobeName))) {
    console.log('FFmpeg binaries already present in resources/ffmpeg — skipping download.')
    return
  }

  mkdirSync(outDir, { recursive: true })
  const work = join(tmpdir(), `ffmpeg-fetch-${Date.now()}`)
  mkdirSync(work, { recursive: true })
  const archive = join(work, name)

  console.log(`Downloading ${name} …`)
  await download(`${BASE}/${name}`, archive)

  console.log('Extracting …')
  extract(archive, kind, work)

  for (const bin of [ffmpegName, ffprobeName]) {
    const src = findBinary(work, bin)
    if (!src) throw new Error(`Could not find ${bin} in the downloaded archive`)
    const dest = join(outDir, bin)
    copyFileSync(src, dest)
    if (process.platform !== 'win32') chmodSync(dest, 0o755)
    console.log(`Installed ${bin} -> ${dest}`)
  }

  rmSync(work, { recursive: true, force: true })
  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
