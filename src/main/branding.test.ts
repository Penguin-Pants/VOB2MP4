import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// The approved Claw Cut package in branding/ is the source of truth. The app
// ships byte-identical copies, so a copy that drifts from its source fails here.
const root = join(__dirname, '..', '..')
const read = (p: string): Buffer => readFileSync(join(root, p))

const COPIES: Array<[copy: string, source: string]> = [
  ['build/icon.ico', 'branding/assets/exported/icon.ico'],
  ['src/renderer/src/assets/icon-master.svg', 'branding/assets/source/icon-master.svg'],
  ['src/renderer/src/tokens.css', 'branding/theme/tokens.css']
]

for (const [copy, source] of COPIES) {
  test(`${copy} is an unchanged copy of ${source}`, () => {
    assert.ok(existsSync(join(root, copy)), `${copy} is missing`)
    assert.ok(read(copy).equals(read(source)), `${copy} differs from ${source}`)
  })
}

test('electron-builder win.icon points at the shipped .ico', () => {
  const yml = read('electron-builder.yml').toString()
  const win = yml.split(/^win:\s*$/m)[1] ?? ''
  const icon = /^\s+icon:\s*(\S+)\s*$/m.exec(win)?.[1]
  assert.equal(icon, 'build/icon.ico')
})

test('the .ico holds a 256 px image, which electron-builder needs for Windows', () => {
  const ico = read('build/icon.ico')
  assert.equal(ico.readUInt16LE(2), 1, 'not an icon resource')
  const sizes = Array.from({ length: ico.readUInt16LE(4) }, (_, i) => ico[6 + 16 * i] || 256)
  assert.ok(sizes.includes(256), `sizes: ${sizes.join(', ')}`)
  assert.ok(sizes.includes(16) && sizes.includes(32), `sizes: ${sizes.join(', ')}`)
})

test('the shipped SVG mark is vector geometry, not an embedded raster', () => {
  const svg = read('src/renderer/src/assets/icon-master.svg').toString()
  assert.match(svg, /<path\b[^>]*\bd="M/)
  assert.doesNotMatch(svg, /<image\b|data:image/)
})
