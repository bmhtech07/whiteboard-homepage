export const BG = '#0a0a0b'
export const PAPER = '#ECE7DB'
export const STICKY_INK = '#1C1B19'

export interface Swatch {
  name: string
  value: string
}

export const STICKY_COLORS: Swatch[] = [
  { name: 'Yellow', value: '#FBE38E' },
  { name: 'Orange', value: '#FDBA74' },
  { name: 'Coral', value: '#FCA5A5' },
  { name: 'Pink', value: '#F9A8D4' },
  { name: 'Lilac', value: '#C4B5FD' },
  { name: 'Blue', value: '#93C5FD' },
  { name: 'Aqua', value: '#7EE7F2' },
  { name: 'Mint', value: '#9BEFB8' },
  { name: 'Lime', value: '#D9F99D' },
  { name: 'Stone', value: '#D6D3CD' },
]

/** Colours for text, lines and outlines — all readable on the near-black canvas. */
export const INK_COLORS: Swatch[] = [
  { name: 'Paper', value: PAPER },
  { name: 'White', value: '#FFFFFF' },
  { name: 'Grey', value: '#8E8E96' },
  { name: 'Red', value: '#F87171' },
  { name: 'Orange', value: '#FB923C' },
  { name: 'Yellow', value: '#FACC15' },
  { name: 'Green', value: '#4ADE80' },
  { name: 'Teal', value: '#2DD4BF' },
  { name: 'Blue', value: '#60A5FA' },
  { name: 'Purple', value: '#A78BFA' },
  { name: 'Pink', value: '#F472B6' },
]

export const FILL_COLORS: Swatch[] = [
  { name: 'None', value: 'transparent' },
  { name: 'Charcoal', value: '#1F1F23' },
  { name: 'Red', value: '#3B1D1F' },
  { name: 'Orange', value: '#3A2716' },
  { name: 'Yellow', value: '#383015' },
  { name: 'Green', value: '#16301F' },
  { name: 'Teal', value: '#12302E' },
  { name: 'Blue', value: '#172A45' },
  { name: 'Purple', value: '#2A2145' },
  { name: 'Paper', value: PAPER },
]

export const PEN_WIDTHS = [
  { name: 'Fine', value: 2 },
  { name: 'Medium', value: 4 },
  { name: 'Bold', value: 8 },
]

/** Relative luminance (0–1) of a #rrggbb colour; transparent counts as dark (the canvas shows through). */
export function luminance(color: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim())
  if (!m) return 0
  const n = parseInt(m[1]!, 16)
  const channel = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

export const isLight = (color: string) => luminance(color) > 0.4
