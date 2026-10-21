import { describe, expect, it } from 'vitest'
import { fitFontSize } from '~/utils/textFit'

describe('fitFontSize', () => {
  // Fake measurement: text width grows linearly with font size.
  const fitsWithin = (avail: number, charsPerPx: number) => (size: number) => size * charsPerPx <= avail

  it('returns the largest size that fits', () => {
    const size = fitFontSize(fitsWithin(100, 4), 6, 64)
    expect(size).toBeLessThanOrEqual(25)
    expect(size).toBeGreaterThan(24)
  })
  it('returns max when everything fits', () => {
    expect(fitFontSize(() => true, 6, 40)).toBe(40)
  })
  it('falls back to min when nothing fits', () => {
    expect(fitFontSize(() => false, 6, 40)).toBe(6)
  })
  it('grows as the box grows and shrinks as it shrinks', () => {
    const small = fitFontSize(fitsWithin(100, 4), 6, 200)
    const big = fitFontSize(fitsWithin(300, 4), 6, 200)
    expect(big).toBeGreaterThan(small * 2.5)
  })
})
