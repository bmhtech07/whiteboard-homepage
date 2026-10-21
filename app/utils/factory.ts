import { PAPER, STICKY_COLORS } from './palette'
import type {
  ConnectorElement,
  ConnectorEnd,
  PathElement,
  Rect,
  ShapeElement,
  ShapeKind,
  StickyElement,
  TextElement,
} from './types'

let counter = 0
export function uid(): string {
  counter = (counter + 1) % 1296
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + counter.toString(36)
}

export const STICKY_SIZE = 200
export const DEFAULT_TEXT_SIZE = 22

export function createSticky(cx: number, cy: number, color = STICKY_COLORS[0]!.value, size = STICKY_SIZE): StickyElement {
  return { id: uid(), type: 'sticky', x: cx - size / 2, y: cy - size / 2, w: size, h: size, text: '', color }
}

/** (x, y) is roughly where the first line's baseline-ish middle should sit, like a click point. */
export function createText(x: number, y: number, opts: Partial<TextElement> = {}): TextElement {
  const fontSize = opts.fontSize ?? DEFAULT_TEXT_SIZE
  return {
    id: uid(),
    type: 'text',
    x: x - fontSize * 0.25,
    y: y - fontSize * 0.75,
    w: fontSize * 2,
    h: fontSize * 1.6,
    text: '',
    fontSize,
    color: PAPER,
    bold: false,
    align: 'left',
    autoWidth: true,
    ...opts,
  }
}

export function defaultShapeSize(kind: ShapeKind): { w: number; h: number } {
  switch (kind) {
    case 'diamond':
      return { w: 160, h: 120 }
    case 'ellipse':
      return { w: 160, h: 100 }
    default:
      return { w: 180, h: 100 }
  }
}

export function createShape(kind: ShapeKind, rect: Rect, opts: Partial<ShapeElement> = {}): ShapeElement {
  return {
    id: uid(),
    type: 'shape',
    shape: kind,
    ...rect,
    text: '',
    stroke: PAPER,
    fill: 'transparent',
    textColor: PAPER,
    fontSize: 18,
    strokeWidth: 2,
    align: 'center',
    valign: 'middle',
    ...opts,
  }
}

export function freeEnd(x: number, y: number): ConnectorEnd {
  return { id: null, side: null, x, y }
}

export function createConnector(from: ConnectorEnd, to: ConnectorEnd, opts: Partial<ConnectorElement> = {}): ConnectorElement {
  return {
    id: uid(),
    type: 'connector',
    from,
    to,
    stroke: PAPER,
    strokeWidth: 2,
    route: 'curve',
    startCap: 'none',
    endCap: 'arrow',
    dashed: false,
    text: '',
    ...opts,
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** Builds a freehand stroke from world-space points, normalising them into the stroke's own box. */
export function createPath(worldPoints: number[], stroke: string, strokeWidth: number): PathElement {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = 0; i < worldPoints.length; i += 2) {
    minX = Math.min(minX, worldPoints[i]!)
    maxX = Math.max(maxX, worldPoints[i]!)
    minY = Math.min(minY, worldPoints[i + 1]!)
    maxY = Math.max(maxY, worldPoints[i + 1]!)
  }
  const pad = strokeWidth / 2 + 1
  const x = minX - pad
  const y = minY - pad
  const w = maxX - minX + pad * 2
  const h = maxY - minY + pad * 2
  const points = worldPoints.map((v, i) => round1(i % 2 === 0 ? v - x : v - y))
  return { id: uid(), type: 'path', x, y, w, h, vw: w, vh: h, points, stroke, strokeWidth }
}

export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
