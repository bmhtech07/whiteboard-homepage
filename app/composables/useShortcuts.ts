import { onBeforeUnmount, onMounted } from 'vue'
import { useActions } from './useActions'
import { useBoard } from './useBoard'
import { createText } from '~/utils/factory'
import { elementBounds, unionRects, type Lookup } from '~/utils/geometry'
import { sanitizeElements } from '~/utils/persistence'
import type { BoardElement, Point, ShapeKind, Tool } from '~/utils/types'

const CLIPBOARD_TYPE = 'application/x-whiteboard-tab'

const TOOL_KEYS: Record<string, Tool> = {
  v: 'select',
  h: 'hand',
  t: 'text',
  s: 'sticky',
  n: 'sticky',
  l: 'connector',
  a: 'connector',
  p: 'pen',
}

const SHAPE_KEYS: Record<string, ShapeKind> = { r: 'rect', o: 'ellipse', d: 'diamond' }

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
}

/** Keyboard shortcuts and copy / cut / paste for the board. */
export function useShortcuts(opts: { pointer: () => Point | null }) {
  const board = useBoard()
  const actions = useActions()
  const { state, ui } = board

  function onKeyDown(e: KeyboardEvent) {
    if (state.editingId || isTyping(e.target)) return
    const mod = e.metaKey || e.ctrlKey
    const key = e.key

    if (key === ' ') {
      e.preventDefault()
      ui.spaceDown = true
      return
    }

    if (mod) {
      const k = key.toLowerCase()
      if (k === 'z') board[e.shiftKey ? 'redo' : 'undo']()
      else if (k === 'y') board.redo()
      else if (k === 'd') actions.duplicateSelection()
      else if (k === 'a') board.selectAll()
      else if (k === '=' || k === '+') actions.zoomBy(1.25)
      else if (k === '-') actions.zoomBy(0.8)
      else if (k === '0') actions.zoomTo(1)
      else return
      e.preventDefault()
      return
    }
    if (e.altKey) return

    if (e.shiftKey && e.code === 'Digit1') {
      actions.fitContent()
      return
    }

    switch (key) {
      case 'Escape':
        if (ui.showHelp) ui.showHelp = false
        else if (state.tool !== 'select') board.setTool('select')
        else board.select([])
        return
      case 'Delete':
      case 'Backspace':
        e.preventDefault()
        actions.deleteSelection()
        return
      case 'Enter': {
        const el = state.selection.length === 1 ? board.get(state.selection[0]!) : null
        if (el && el.type !== 'path') {
          e.preventDefault()
          board.startEditing(el.id)
        }
        return
      }
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight': {
        if (!state.selection.length) return
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0
        const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0
        actions.nudge(dx, dy)
        return
      }
      case ']':
        actions.bringToFront()
        return
      case '[':
        actions.sendToBack()
        return
      case '?':
        ui.showHelp = !ui.showHelp
        return
    }

    const k = key.toLowerCase()
    if (SHAPE_KEYS[k]) {
      state.shapeKind = SHAPE_KEYS[k]
      board.setTool('shape')
    } else if (TOOL_KEYS[k]) {
      board.setTool(TOOL_KEYS[k])
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    if (e.key === ' ') ui.spaceDown = false
  }

  function onBlur() {
    ui.spaceDown = false
  }

  // ------------------------------------------------------------- clipboard

  /** Selection plus connectors running between selected elements. */
  function copyable(): BoardElement[] {
    const ids = new Set(state.selection)
    return state.elements.filter(
      (el) =>
        ids.has(el.id) ||
        (el.type === 'connector' && !!el.from.id && !!el.to.id && ids.has(el.from.id) && ids.has(el.to.id)),
    )
  }

  function onCopy(e: ClipboardEvent) {
    if (state.editingId || isTyping(e.target) || !state.selection.length || !e.clipboardData) return
    const els = copyable()
    e.clipboardData.setData(CLIPBOARD_TYPE, JSON.stringify(els))
    e.clipboardData.setData(
      'text/plain',
      els
        .map((el) => ('text' in el ? el.text : ''))
        .filter(Boolean)
        .join('\n\n'),
    )
    e.preventDefault()
  }

  function onCut(e: ClipboardEvent) {
    if (state.editingId || isTyping(e.target) || !state.selection.length) return
    onCopy(e)
    actions.deleteSelection()
  }

  function pasteTarget(): Point {
    const p = opts.pointer()
    if (p) return p
    return board.screenToWorld(window.innerWidth / 2, window.innerHeight / 2)
  }

  function onPaste(e: ClipboardEvent) {
    if (state.editingId || isTyping(e.target) || !e.clipboardData) return
    const at = pasteTarget()
    const custom = e.clipboardData.getData(CLIPBOARD_TYPE)
    if (custom) {
      let els: BoardElement[] = []
      try {
        els = sanitizeElements(JSON.parse(custom))
      } catch {
        return
      }
      if (!els.length) return
      e.preventDefault()
      const src = new Map(els.map((el) => [el.id, el]))
      const lookup: Lookup = (id) => src.get(id) ?? board.get(id)
      const b = unionRects(els.map((el) => elementBounds(el, lookup)))!
      const ids = board.insertCopies(els, { x: at.x - (b.x + b.w / 2), y: at.y - (b.y + b.h / 2) })
      board.select(ids)
      board.commit()
      return
    }
    const text = e.clipboardData.getData('text/plain').replace(/\r\n/g, '\n').trim()
    if (!text) return
    e.preventDefault()
    const long = text.length > 60
    const el = board.add(createText(at.x, at.y, { text, autoWidth: !long, w: long ? 480 : 44 }))
    board.select([el.id])
    board.commit()
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    document.addEventListener('copy', onCopy)
    document.addEventListener('cut', onCut)
    document.addEventListener('paste', onPaste)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', onBlur)
    document.removeEventListener('copy', onCopy)
    document.removeEventListener('cut', onCut)
    document.removeEventListener('paste', onPaste)
  })
}
