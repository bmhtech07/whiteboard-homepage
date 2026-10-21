/**
 * Largest font size in [min, max] for which `fits(size)` is true, assuming `fits` is
 * monotonic (bigger text never fits better). Used by sticky notes and shapes so their
 * text grows and shrinks with the box.
 */
export function fitFontSize(fits: (size: number) => boolean, min: number, max: number, iterations = 8): number {
  if (max <= min) return min
  if (fits(max)) return max
  if (!fits(min)) return min
  let lo = min
  let hi = max
  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) / 2
    if (fits(mid)) lo = mid
    else hi = mid
  }
  return Math.max(min, Math.floor(lo * 2) / 2)
}

/**
 * Measures `node` at successive font sizes and leaves it set to the largest size that
 * keeps its content inside `availW × availH`. Returns that size.
 */
export function fitNodeText(node: HTMLElement, availW: number, availH: number, min: number, max: number): number {
  const fits = (size: number) => {
    node.style.fontSize = `${size}px`
    return node.scrollWidth <= availW + 0.5 && node.scrollHeight <= availH + 0.5
  }
  const size = fitFontSize(fits, min, Math.max(min, max))
  node.style.fontSize = `${size}px`
  return size
}
