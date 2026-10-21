import type {
  BoardElement,
  BoxElement,
  ConnectorElement,
  ConnectorEnd,
  Handle,
  Point,
  Rect,
  Route,
  Side,
} from './types'

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export const center = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

export const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)

export function rectFromPoints(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  }
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y
}

export function pointInRect(p: Point, r: Rect, margin = 0): boolean {
  return (
    p.x >= r.x - margin && p.x <= r.x + r.w + margin && p.y >= r.y - margin && p.y <= r.y + r.h + margin
  )
}

export function unionRects(rects: Rect[]): Rect | null {
  if (!rects.length) return null
  let x1 = Infinity
  let y1 = Infinity
  let x2 = -Infinity
  let y2 = -Infinity
  for (const r of rects) {
    x1 = Math.min(x1, r.x)
    y1 = Math.min(y1, r.y)
    x2 = Math.max(x2, r.x + r.w)
    y2 = Math.max(y2, r.y + r.h)
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

export const SIDES: Side[] = ['top', 'right', 'bottom', 'left']

export const SIDE_DIR: Record<Side, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
}

export function sidePoint(r: Rect, side: Side): Point {
  switch (side) {
    case 'top':
      return { x: r.x + r.w / 2, y: r.y }
    case 'right':
      return { x: r.x + r.w, y: r.y + r.h / 2 }
    case 'bottom':
      return { x: r.x + r.w / 2, y: r.y + r.h }
    case 'left':
      return { x: r.x, y: r.y + r.h / 2 }
  }
}

/** The side of `r` that faces `toward`, normalised by the rect's proportions. */
export function autoSide(r: Rect, toward: Point): Side {
  const c = center(r)
  const dx = (toward.x - c.x) / Math.max(r.w, 1)
  const dy = (toward.y - c.y) / Math.max(r.h, 1)
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'bottom' : 'top'
}

/** Where a ray from the element's centre toward `toward` leaves the element's outline. */
export function boundaryPoint(el: BoxElement, toward: Point): Point {
  const c = center(el)
  const dx = toward.x - c.x
  const dy = toward.y - c.y
  if (dx === 0 && dy === 0) return c
  const hw = Math.max(el.w / 2, 0.5)
  const hh = Math.max(el.h / 2, 0.5)
  let t: number
  if (el.type === 'shape' && el.shape === 'ellipse') {
    t = 1 / Math.sqrt((dx * dx) / (hw * hw) + (dy * dy) / (hh * hh))
  } else if (el.type === 'shape' && el.shape === 'diamond') {
    t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh)
  } else {
    t = Math.min(dx !== 0 ? hw / Math.abs(dx) : Infinity, dy !== 0 ? hh / Math.abs(dy) : Infinity)
  }
  return { x: c.x + dx * t, y: c.y + dy * t }
}

export const isBox = (el: BoardElement | undefined | null): el is BoxElement =>
  !!el && el.type !== 'connector'

/** Elements a connector can snap to. Freehand strokes are excluded. */
export const isConnectable = (el: BoardElement | undefined | null): el is BoxElement =>
  !!el && (el.type === 'sticky' || el.type === 'shape' || el.type === 'text')

export type Lookup = (id: string) => BoardElement | undefined

interface ResolvedEnd {
  p: Point
  dir: Point | null
}

function attached(end: ConnectorEnd, lookup: Lookup): BoxElement | null {
  if (!end.id) return null
  const el = lookup(end.id)
  return isBox(el) ? el : null
}

function resolveEnd(end: ConnectorEnd, el: BoxElement | null, toward: Point, route: Route): ResolvedEnd {
  if (!el) return { p: { x: end.x, y: end.y }, dir: null }
  if (end.side) return { p: sidePoint(el, end.side), dir: SIDE_DIR[end.side] }
  if (route === 'straight') return { p: boundaryPoint(el, toward), dir: null }
  const side = autoSide(el, toward)
  return { p: sidePoint(el, side), dir: SIDE_DIR[side] }
}

/** Resolves both connector ends to concrete points (and outward directions when attached to a side). */
export function resolveConnector(c: ConnectorElement, lookup: Lookup): { start: ResolvedEnd; end: ResolvedEnd } {
  const a = attached(c.from, lookup)
  const b = attached(c.to, lookup)
  const aRef = a ? center(a) : { x: c.from.x, y: c.from.y }
  const bRef = b ? center(b) : { x: c.to.x, y: c.to.y }
  return {
    start: resolveEnd(c.from, a, bRef, c.route),
    end: resolveEnd(c.to, b, aRef, c.route),
  }
}

function axisDir(from: Point, to: Point): Point {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (Math.abs(dx) >= Math.abs(dy)) return { x: Math.sign(dx) || 1, y: 0 }
  return { x: 0, y: Math.sign(dy) || 1 }
}

/** Drops duplicate points and middle points that lie on a straight run. */
export function simplifyPolyline(pts: Point[]): Point[] {
  const out: Point[] = []
  for (const p of pts) {
    const last = out[out.length - 1]
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue
    out.push(p)
  }
  for (let i = out.length - 2; i >= 1; i--) {
    const a = out[i - 1]!
    const b = out[i]!
    const c = out[i + 1]!
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    const dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)
    if (Math.abs(cross) < 0.01 && dot >= 0) out.splice(i, 1)
  }
  return out
}

/** Orthogonal (right-angled) route between two points leaving/entering in the given directions. */
export function elbowRoute(p0: Point, d0: Point, p1: Point, d1: Point, gap0 = 24, gap1 = 24): Point[] {
  const a = { x: p0.x + d0.x * gap0, y: p0.y + d0.y * gap0 }
  const b = { x: p1.x + d1.x * gap1, y: p1.y + d1.y * gap1 }
  const pts: Point[] = [p0, a]
  const h0 = d0.x !== 0
  const h1 = d1.x !== 0
  if (h0 && h1) {
    const mx = (a.x + b.x) / 2
    pts.push({ x: mx, y: a.y }, { x: mx, y: b.y })
  } else if (!h0 && !h1) {
    const my = (a.y + b.y) / 2
    pts.push({ x: a.x, y: my }, { x: b.x, y: my })
  } else if (h0) {
    pts.push({ x: b.x, y: a.y })
  } else {
    pts.push({ x: a.x, y: b.y })
  }
  pts.push(b, p1)
  return simplifyPolyline(pts)
}

function polylineMidpoint(pts: Point[]): Point {
  let total = 0
  for (let i = 1; i < pts.length; i++) total += distance(pts[i - 1]!, pts[i]!)
  let remaining = total / 2
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!
    const b = pts[i]!
    const len = distance(a, b)
    if (remaining <= len && len > 0) {
      const t = remaining / len
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    }
    remaining -= len
  }
  return pts[0] ?? { x: 0, y: 0 }
}

function cubicAt(p0: Point, c0: Point, c1: Point, p1: Point, t: number): Point {
  const u = 1 - t
  return {
    x: u * u * u * p0.x + 3 * u * u * t * c0.x + 3 * u * t * t * c1.x + t * t * t * p1.x,
    y: u * u * u * p0.y + 3 * u * u * t * c0.y + 3 * u * t * t * c1.y + t * t * t * p1.y,
  }
}

function moveToward(from: Point, to: Point, amount: number): Point {
  const len = distance(from, to)
  if (len < 0.0001) return from
  const t = Math.min(amount, len * 0.5) / len
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
}

const fmt = (n: number) => Math.round(n * 100) / 100

export interface ConnectorGeometry {
  /** SVG path data (already trimmed so arrowheads sit cleanly at the ends). */
  d: string
  start: Point
  end: Point
  /** Angle (radians) the line arrives at the end point / leaves the start point, pointing outward. */
  endAngle: number
  startAngle: number
  mid: Point
  bounds: Rect
  arrowSize: number
}

export const arrowSizeFor = (strokeWidth: number) => 9 + strokeWidth * 2.2

export function connectorGeometry(c: ConnectorElement, lookup: Lookup): ConnectorGeometry {
  const { start, end } = resolveConnector(c, lookup)
  const p0 = start.p
  const p1 = end.p
  const arrowSize = arrowSizeFor(c.strokeWidth)
  const trimStart = c.startCap === 'arrow' ? arrowSize * 0.75 : 0
  const trimEnd = c.endCap === 'arrow' ? arrowSize * 0.75 : 0

  let d: string
  let mid: Point
  let startAngle: number
  let endAngle: number
  let extent: Point[]

  if (c.route === 'curve') {
    const len = distance(p0, p1)
    const k = clamp(len * 0.45, 24, 240)
    const d0 = start.dir ?? unit(p0, p1)
    const d1 = end.dir ?? unit(p1, p0)
    const c0 = { x: p0.x + d0.x * k, y: p0.y + d0.y * k }
    const c1 = { x: p1.x + d1.x * k, y: p1.y + d1.y * k }
    const s = trimStart ? moveToward(p0, c0, trimStart) : p0
    const e = trimEnd ? moveToward(p1, c1, trimEnd) : p1
    d = `M${fmt(s.x)} ${fmt(s.y)} C${fmt(c0.x)} ${fmt(c0.y)} ${fmt(c1.x)} ${fmt(c1.y)} ${fmt(e.x)} ${fmt(e.y)}`
    mid = cubicAt(p0, c0, c1, p1, 0.5)
    endAngle = angle(c1, p1)
    startAngle = angle(c0, p0)
    extent = [p0, c0, c1, p1]
  } else {
    let pts: Point[]
    if (c.route === 'elbow') {
      const d0 = start.dir ?? axisDir(p0, p1)
      const d1 = end.dir ?? axisDir(p1, p0)
      pts = elbowRoute(p0, d0, p1, d1, start.dir ? 24 : 0, end.dir ? 24 : 0)
    } else {
      pts = [p0, p1]
    }
    if (pts.length < 2) pts = [p0, p1]
    const n = pts.length
    endAngle = angle(pts[n - 2]!, pts[n - 1]!)
    startAngle = angle(pts[1]!, pts[0]!)
    mid = polylineMidpoint(pts)
    const drawn = pts.slice()
    if (trimStart) drawn[0] = moveToward(pts[0]!, pts[1]!, trimStart)
    if (trimEnd) drawn[n - 1] = moveToward(pts[n - 1]!, pts[n - 2]!, trimEnd)
    d = drawn.map((p, i) => `${i ? 'L' : 'M'}${fmt(p.x)} ${fmt(p.y)}`).join(' ')
    extent = pts
  }

  const pad = arrowSize + c.strokeWidth + 8
  const b = unionRects(extent.map((p) => ({ x: p.x, y: p.y, w: 0, h: 0 })))!
  return {
    d,
    start: p0,
    end: p1,
    startAngle,
    endAngle,
    mid,
    arrowSize,
    bounds: { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 },
  }
}

function unit(from: Point, to: Point): Point {
  const len = distance(from, to)
  if (len < 0.0001) return { x: 1, y: 0 }
  return { x: (to.x - from.x) / len, y: (to.y - from.y) / len }
}

const angle = (from: Point, to: Point) => Math.atan2(to.y - from.y, to.x - from.x)

/** Triangle points for an arrowhead whose tip is at `tip`, pointing along `theta`. */
export function arrowHead(tip: Point, theta: number, size: number): string {
  const spread = 0.42
  const a = { x: tip.x - size * Math.cos(theta - spread), y: tip.y - size * Math.sin(theta - spread) }
  const b = { x: tip.x - size * Math.cos(theta + spread), y: tip.y - size * Math.sin(theta + spread) }
  return `${fmt(tip.x)},${fmt(tip.y)} ${fmt(a.x)},${fmt(a.y)} ${fmt(b.x)},${fmt(b.y)}`
}

/** Bounding box of any element (connectors are resolved through `lookup`). */
export function elementBounds(el: BoardElement, lookup: Lookup): Rect {
  if (el.type === 'connector') {
    const g = connectorGeometry(el, lookup)
    const r = unionRects([
      { x: g.start.x, y: g.start.y, w: 0, h: 0 },
      { x: g.end.x, y: g.end.y, w: 0, h: 0 },
      { x: g.mid.x, y: g.mid.y, w: 0, h: 0 },
    ])!
    return r
  }
  return { x: el.x, y: el.y, w: el.w, h: el.h }
}

// ---------------------------------------------------------------------------
// Resizing
// ---------------------------------------------------------------------------

export const CORNER_HANDLES: Handle[] = ['nw', 'ne', 'se', 'sw']
export const ALL_HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
export const isCorner = (h: Handle) => h.length === 2

/** Resize `start` by dragging `handle` by (dx, dy). The opposite edge/corner stays fixed. */
export function resizeRect(start: Rect, handle: Handle, dx: number, dy: number, keepAspect = false, min = 16): Rect {
  let left = start.x
  let top = start.y
  let right = start.x + start.w
  let bottom = start.y + start.h
  if (handle.includes('w')) left = Math.min(left + dx, right - min)
  if (handle.includes('e')) right = Math.max(right + dx, left + min)
  if (handle.includes('n')) top = Math.min(top + dy, bottom - min)
  if (handle.includes('s')) bottom = Math.max(bottom + dy, top + min)

  if (keepAspect && isCorner(handle) && start.w > 0 && start.h > 0) {
    const ratio = start.w / start.h
    let w = right - left
    let h = bottom - top
    if (w / h > ratio) w = h * ratio
    else h = w / ratio
    if (handle.includes('w')) left = right - w
    else right = left + w
    if (handle.includes('n')) top = bottom - h
    else bottom = top + h
  }
  return { x: left, y: top, w: right - left, h: bottom - top }
}

function oppositeCorner(r: Rect, handle: Handle): Point {
  return {
    x: handle.includes('w') ? r.x + r.w : r.x,
    y: handle.includes('n') ? r.y + r.h : r.y,
  }
}

/**
 * Uniform scale factor for dragging a corner handle by `delta`: the dragged corner's
 * new position is projected onto the box diagonal through the fixed opposite corner.
 */
export function cornerScale(start: Rect, handle: Handle, delta: Point): number {
  const anchor = oppositeCorner(start, handle)
  const corner = {
    x: handle.includes('w') ? start.x : start.x + start.w,
    y: handle.includes('n') ? start.y : start.y + start.h,
  }
  const v = { x: corner.x - anchor.x, y: corner.y - anchor.y }
  const len2 = v.x * v.x + v.y * v.y
  if (len2 === 0) return 1
  const moved = { x: corner.x + delta.x - anchor.x, y: corner.y + delta.y - anchor.y }
  return (moved.x * v.x + moved.y * v.y) / len2
}

/** Rect after uniformly scaling `start` by `s` about the corner opposite `handle`. */
export function scaleRectFromCorner(start: Rect, handle: Handle, s: number): Rect {
  const anchor = oppositeCorner(start, handle)
  const w = start.w * s
  const h = start.h * s
  return {
    x: handle.includes('w') ? anchor.x - w : anchor.x,
    y: handle.includes('n') ? anchor.y - h : anchor.y,
    w,
    h,
  }
}

/** Smooth SVG path through freehand points (quadratic curves through segment midpoints). */
export function smoothPath(points: number[], sx = 1, sy = 1): string {
  const n = Math.floor(points.length / 2)
  if (n === 0) return ''
  const X = (i: number) => fmt(points[i * 2]! * sx)
  const Y = (i: number) => fmt(points[i * 2 + 1]! * sy)
  if (n === 1) return `M${X(0)} ${Y(0)} L${X(0)} ${Y(0)}`
  let d = `M${X(0)} ${Y(0)}`
  for (let i = 1; i < n - 1; i++) {
    const mx = fmt(((points[i * 2]! + points[(i + 1) * 2]!) / 2) * sx)
    const my = fmt(((points[i * 2 + 1]! + points[(i + 1) * 2 + 1]!) / 2) * sy)
    d += ` Q${X(i)} ${Y(i)} ${mx} ${my}`
  }
  d += ` L${X(n - 1)} ${Y(n - 1)}`
  return d
}
