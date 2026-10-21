// Draws the extension icons (a yellow sticky note on a dark tile) as PNGs with no
// dependencies: shapes are signed-distance functions, supersampled for anti-aliasing.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '../public/icons')
const SIZES = [16, 32, 48, 128]
const SS = 4 // samples per axis

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]

function roundedBox(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r)
  const qy = Math.abs(py - cy) - (hh - r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

function rotate(px, py, cx, cy, deg) {
  const a = (deg * Math.PI) / 180
  const dx = px - cx
  const dy = py - cy
  return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)]
}

// Colour of the icon at normalised coordinates (0..1), as [r, g, b, a].
function shade(u, v, size) {
  const layers = []
  const tile = roundedBox(u, v, 0.5, 0.5, 0.5, 0.5, 0.22)
  if (tile > 0) return [0, 0, 0, 0]
  const border = size >= 48 ? 0.025 : 0
  layers.push(tile > -border ? hex('#2e2e34') : hex('#121214'))

  const [ru, rv] = rotate(u, v, 0.5, 0.52, 6)
  const shadow = roundedBox(ru, rv - 0.03, 0.5, 0.52, 0.28, 0.28, 0.03)
  if (shadow < 0.02) layers.push([5, 5, 6])
  const note = roundedBox(ru, rv, 0.5, 0.5, 0.28, 0.28, size >= 32 ? 0.025 : 0.01)
  if (note < 0) {
    layers.push(hex('#fbe38e'))
    if (size >= 32) {
      const line1 = roundedBox(ru, rv, 0.47, 0.43, 0.15, 0.03, 0.03)
      const line2 = roundedBox(ru, rv, 0.42, 0.56, 0.1, 0.03, 0.03)
      if (line1 < 0 || line2 < 0) layers.push(hex('#6b5d2c'))
    }
  }
  return [...layers[layers.length - 1], 255]
}

function render(size) {
  const px = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const [cr, cg, cb, ca] = shade((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size, size)
          r += cr * ca
          g += cg * ca
          b += cb * ca
          a += ca
        }
      }
      const i = (y * size + x) * 4
      px[i] = a ? Math.round(r / a) : 0
      px[i + 1] = a ? Math.round(g / a) : 0
      px[i + 2] = a ? Math.round(b / a) : 0
      px[i + 3] = Math.round(a / (SS * SS))
    }
  }
  return px
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size, rgba) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync(outDir, { recursive: true })
for (const size of SIZES) {
  writeFileSync(join(outDir, `icon${size}.png`), png(size, render(size)))
}
console.log(`Wrote ${SIZES.map((s) => `icon${s}.png`).join(', ')} to public/icons/`)
