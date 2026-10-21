import { describe, expect, it } from 'vitest'
import { createBoard } from '~/utils/board'
import { createConnector, createShape, createSticky, createText, freeEnd } from '~/utils/factory'
import { resolveConnector } from '~/utils/geometry'
import type { ConnectorElement } from '~/utils/types'

function setup() {
  const board = createBoard()
  const a = board.add(createShape('rect', { x: 0, y: 0, w: 100, h: 100 }))
  const b = board.add(createShape('rect', { x: 300, y: 0, w: 100, h: 100 }))
  const c = board.add(createConnector({ id: a.id, side: null, x: 0, y: 0 }, { id: b.id, side: null, x: 0, y: 0 }))
  board.commit()
  return { board, a, b, c }
}

describe('board', () => {
  it('removes connectors together with the element they attach to', () => {
    const { board, a, b, c } = setup()
    board.remove([a.id])
    expect(board.get(a.id)).toBeUndefined()
    expect(board.get(c.id)).toBeUndefined()
    expect(board.get(b.id)).toBeDefined()
  })

  it('undoes and redoes whole actions', () => {
    const { board, a } = setup()
    board.moveBy([a.id], 50, 0)
    board.commit()
    expect(board.get(a.id)!.type === 'shape' && (board.get(a.id) as { x: number }).x).toBe(50)
    board.undo()
    expect((board.get(a.id) as { x: number }).x).toBe(0)
    board.redo()
    expect((board.get(a.id) as { x: number }).x).toBe(50)
  })

  it('moves only the free ends of a selected connector', () => {
    const board = createBoard()
    const a = board.add(createShape('rect', { x: 0, y: 0, w: 100, h: 100 }))
    const c = board.add(createConnector({ id: a.id, side: 'right', x: 0, y: 0 }, freeEnd(400, 50)))
    board.moveBy([c.id], 10, 20)
    const conn = board.get(c.id) as ConnectorElement
    expect(conn.to).toMatchObject({ x: 410, y: 70 })
    expect(conn.from.id).toBe(a.id)
  })

  it('duplicates elements and re-wires connectors between the copies', () => {
    const { board, a, b } = setup()
    const before = board.state.elements.length
    const ids = board.duplicate([a.id, b.id])
    expect(board.state.elements.length).toBe(before + 3)
    const copyConn = ids.map((id) => board.get(id)).find((e) => e?.type === 'connector') as ConnectorElement
    expect(copyConn).toBeDefined()
    expect(ids).toContain(copyConn.from.id)
    expect(ids).toContain(copyConn.to.id)
    expect(copyConn.from.id).not.toBe(a.id)
  })

  it('detaches copied connector ends whose element was not copied', () => {
    const { board, c } = setup()
    const original = resolveConnector(board.get(c.id) as ConnectorElement, board.get)
    const [copyId] = board.duplicate([c.id], { x: 10, y: 10 })
    const copy = board.get(copyId!) as ConnectorElement
    expect(copy.from.id).toBeNull()
    expect(copy.from.x).toBeCloseTo(original.start.p.x + 10)
    expect(copy.to.y).toBeCloseTo(original.end.p.y + 10)
  })

  it('reorders elements', () => {
    const { board, a, c } = setup()
    board.bringToFront([a.id])
    expect(board.state.elements.at(-1)!.id).toBe(a.id)
    board.sendToBack([c.id])
    expect(board.state.elements[0]!.id).toBe(c.id)
  })

  it('discards empty text when editing ends, but keeps empty stickies', () => {
    const board = createBoard()
    const t = board.add(createText(0, 0))
    const s = board.add(createSticky(0, 0))
    board.startEditing(t.id)
    board.stopEditing()
    expect(board.get(t.id)).toBeUndefined()
    board.startEditing(s.id)
    board.stopEditing()
    expect(board.get(s.id)).toBeDefined()
  })

  it('zooms around the cursor', () => {
    const board = createBoard()
    const before = board.screenToWorld(400, 300)
    board.zoomAt(400, 300, 2)
    const after = board.screenToWorld(400, 300)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
    board.zoomAt(0, 0, 100)
    expect(board.state.viewport.zoom).toBe(4)
  })

  it('fits the viewport to content', () => {
    const { board } = setup()
    const bounds = board.contentBounds()!
    board.fitTo(bounds, 1200, 800)
    const centre = board.worldToScreen(bounds.x + bounds.w / 2, bounds.y + bounds.h / 2)
    expect(centre.x).toBeCloseTo(600)
    expect(centre.y).toBeCloseTo(400)
  })

  it('hit-tests the topmost box', () => {
    const board = createBoard()
    const under = board.add(createShape('rect', { x: 0, y: 0, w: 100, h: 100 }))
    const over = board.add(createSticky(150, 150)) // covers 50..250
    expect(board.hitBox({ x: 60, y: 60 })!.id).toBe(over.id)
    expect(board.hitBox({ x: 5, y: 5 })!.id).toBe(under.id)
    expect(board.hitBox({ x: 900, y: 900 })).toBeNull()
  })
})
