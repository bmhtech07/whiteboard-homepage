import { describe, expect, it } from 'vitest'
import {
  autoSide,
  boundaryPoint,
  connectorGeometry,
  cornerScale,
  elbowRoute,
  resizeRect,
  resolveConnector,
  scaleRectFromCorner,
  simplifyPolyline,
  smoothPath,
} from '~/utils/geometry'
import { createConnector, createShape, freeEnd } from '~/utils/factory'
import type { BoardElement } from '~/utils/types'

const box = (shape: 'rect' | 'ellipse' | 'diamond', x = 0, y = 0, w = 100, h = 50) =>
  createShape(shape, { x, y, w, h })

describe('boundaryPoint', () => {
  it('clips to the rectangle edge', () => {
    expect(boundaryPoint(box('rect'), { x: 500, y: 25 })).toEqual({ x: 100, y: 25 })
    expect(boundaryPoint(box('rect'), { x: 50, y: -300 })).toEqual({ x: 50, y: 0 })
  })
  it('lands on the ellipse outline', () => {
    const p = boundaryPoint(box('ellipse'), { x: 150, y: 75 })
    const nx = (p.x - 50) / 50
    const ny = (p.y - 25) / 25
    expect(nx * nx + ny * ny).toBeCloseTo(1, 6)
  })
  it('lands on the diamond outline', () => {
    const p = boundaryPoint(box('diamond'), { x: 150, y: 75 })
    expect(Math.abs(p.x - 50) / 50 + Math.abs(p.y - 25) / 25).toBeCloseTo(1, 6)
  })
})

describe('autoSide', () => {
  const r = { x: 0, y: 0, w: 100, h: 100 }
  it('picks the side facing the target', () => {
    expect(autoSide(r, { x: 300, y: 60 })).toBe('right')
    expect(autoSide(r, { x: -300, y: 60 })).toBe('left')
    expect(autoSide(r, { x: 40, y: 400 })).toBe('bottom')
    expect(autoSide(r, { x: 60, y: -400 })).toBe('top')
  })
})

describe('elbowRoute', () => {
  it('produces only horizontal/vertical segments', () => {
    const pts = elbowRoute({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 200, y: 120 }, { x: -1, y: 0 })
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!
      const b = pts[i]!
      expect(a.x === b.x || a.y === b.y).toBe(true)
    }
    expect(pts[0]).toEqual({ x: 0, y: 0 })
    expect(pts[pts.length - 1]).toEqual({ x: 200, y: 120 })
  })
  it('collapses to a straight line when aligned', () => {
    const pts = elbowRoute({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 200, y: 0 }, { x: -1, y: 0 })
    expect(pts).toEqual([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ])
  })
})

describe('simplifyPolyline', () => {
  it('removes duplicates and collinear midpoints but keeps corners', () => {
    expect(
      simplifyPolyline([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ])
  })
})

describe('connectors', () => {
  const a = box('rect', 0, 0, 100, 100)
  const b = box('rect', 300, 0, 100, 100)
  const els = new Map<string, BoardElement>([
    [a.id, a],
    [b.id, b],
  ])
  const lookup = (id: string) => els.get(id)

  it('attaches straight connectors to facing edges', () => {
    const c = createConnector({ id: a.id, side: null, x: 0, y: 0 }, { id: b.id, side: null, x: 0, y: 0 }, { route: 'straight' })
    const { start, end } = resolveConnector(c, lookup)
    expect(start.p).toEqual({ x: 100, y: 50 })
    expect(end.p).toEqual({ x: 300, y: 50 })
  })

  it('uses explicit sides when given', () => {
    const c = createConnector({ id: a.id, side: 'bottom', x: 0, y: 0 }, { id: b.id, side: 'top', x: 0, y: 0 })
    const { start, end } = resolveConnector(c, lookup)
    expect(start.p).toEqual({ x: 50, y: 100 })
    expect(end.p).toEqual({ x: 350, y: 0 })
  })

  it('follows elements when they move', () => {
    const c = createConnector({ id: a.id, side: null, x: 0, y: 0 }, freeEnd(50, 400), { route: 'straight' })
    const before = resolveConnector(c, lookup).start.p
    a.y += 100
    const after = resolveConnector(c, lookup).start.p
    expect(after.y - before.y).toBe(100)
    a.y -= 100
  })

  it('produces a path and padded bounds for every route', () => {
    for (const route of ['straight', 'elbow', 'curve'] as const) {
      const c = createConnector({ id: a.id, side: null, x: 0, y: 0 }, { id: b.id, side: null, x: 0, y: 0 }, { route })
      const g = connectorGeometry(c, lookup)
      expect(g.d.startsWith('M')).toBe(true)
      expect(g.bounds.x).toBeLessThan(100)
      expect(g.bounds.x + g.bounds.w).toBeGreaterThan(300)
      expect(g.end).toEqual({ x: 300, y: 50 })
    }
  })
})

describe('resizing', () => {
  const r = { x: 0, y: 0, w: 100, h: 50 }
  it('moves only the dragged edge', () => {
    expect(resizeRect(r, 'e', 20, 999)).toEqual({ x: 0, y: 0, w: 120, h: 50 })
    expect(resizeRect(r, 'nw', 10, 10)).toEqual({ x: 10, y: 10, w: 90, h: 40 })
  })
  it('enforces a minimum size', () => {
    expect(resizeRect(r, 'w', 500, 0, false, 16)).toEqual({ x: 84, y: 0, w: 16, h: 50 })
  })
  it('keeps aspect ratio on corners when asked', () => {
    const out = resizeRect(r, 'se', 100, 0, true)
    expect(out.w / out.h).toBeCloseTo(2)
  })
  it('scales uniformly from a corner, anchoring the opposite corner', () => {
    expect(cornerScale(r, 'se', { x: 100, y: 50 })).toBeCloseTo(2)
    expect(cornerScale(r, 'nw', { x: 50, y: 25 })).toBeCloseTo(0.5)
    const scaled = scaleRectFromCorner(r, 'nw', 2)
    expect(scaled).toEqual({ x: -100, y: -50, w: 200, h: 100 })
  })
})

describe('smoothPath', () => {
  it('handles single points and polylines', () => {
    expect(smoothPath([5, 5])).toBe('M5 5 L5 5')
    expect(smoothPath([0, 0, 10, 0, 20, 10])).toBe('M0 0 Q10 0 15 5 L20 10')
    expect(smoothPath([0, 0, 10, 10], 2, 3)).toBe('M0 0 L20 30')
  })
})
