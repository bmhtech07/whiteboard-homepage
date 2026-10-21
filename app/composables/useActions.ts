import { useBoard } from './useBoard'

/** Commands shared by the toolbars and keyboard shortcuts. */
export function useActions() {
  const board = useBoard()
  const { state } = board
  const viewW = () => window.innerWidth
  const viewH = () => window.innerHeight

  function zoomBy(factor: number) {
    board.zoomAt(viewW() / 2, viewH() / 2, state.viewport.zoom * factor)
  }

  function zoomTo(zoom: number) {
    board.zoomAt(viewW() / 2, viewH() / 2, zoom)
  }

  /** Frames everything on the board (or centres the origin when empty). */
  function fitContent() {
    const bounds = board.contentBounds()
    if (!bounds) {
      Object.assign(state.viewport, { x: viewW() / 2, y: viewH() / 2, zoom: 1 })
      return
    }
    board.fitTo(bounds, viewW(), viewH(), 96, 1)
  }

  function deleteSelection() {
    if (!state.selection.length) return
    board.remove(state.selection)
    board.commit()
  }

  function duplicateSelection() {
    if (!state.selection.length) return
    board.select(board.duplicate(state.selection))
    board.commit()
  }

  function bringToFront() {
    board.bringToFront(state.selection)
    board.commit()
  }

  function sendToBack() {
    board.sendToBack(state.selection)
    board.commit()
  }

  function nudge(dx: number, dy: number) {
    if (!state.selection.length) return
    board.moveBy(state.selection, dx, dy)
    board.commit()
  }

  return { zoomBy, zoomTo, fitContent, deleteSelection, duplicateSelection, bringToFront, sendToBack, nudge }
}
