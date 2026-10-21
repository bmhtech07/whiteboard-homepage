import { computed, reactive } from 'vue'
import { clone, uid } from './factory'
import { clamp, elementBounds, isBox, resolveConnector, unionRects, type Lookup } from './geometry'
import { createHistory } from './history'
import { PAPER, STICKY_COLORS } from './palette'
import type { BoardElement, Point, Rect, ShapeKind, Side, Tool, Viewport } from './types'

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 4

export interface UiState {
  marquee: Rect | null
  /** Element (and optional side) a connector end would snap to while dragging. */
  connectTarget: { id: string; side: Side | null } | null
  hoverId: string | null
  /** True while a pointer gesture is in progress (hides floating toolbars). */
  interacting: boolean
  panning: boolean
  spaceDown: boolean
  showHelp: boolean
}

export function createBoard() {
  const state = reactive({
    elements: [] as BoardElement[],
    selection: [] as string[],
    editingId: null as string | null,
    tool: 'select' as Tool,
    viewport: { x: 0, y: 0, zoom: 1 } as Viewport,
    stickyColor: STICKY_COLORS[0]!.value,
    shapeKind: 'rect' as ShapeKind,
    penColor: PAPER,
    penWidth: 4,
    loaded: false,
  })

  const ui = reactive<UiState>({
    marquee: null,
    connectTarget: null,
    hoverId: null,
    interacting: false,
    panning: false,
    spaceDown: false,
    showHelp: false,
  })

  const history = createHistory()
  const flags = reactive({ canUndo: false, canRedo: false })
  const commitListeners = new Set<() => void>()

  const index = computed(() => {
    const map = new Map<string, BoardElement>()
    for (const el of state.elements) map.set(el.id, el)
    return map
  })
  const selectionSet = computed(() => new Set(state.selection))
  const selected = computed(() => state.selection.map((id) => index.value.get(id)).filter((e): e is BoardElement => !!e))

  const get: Lookup = (id) => index.value.get(id)
  const snapshot = () => JSON.stringify(state.elements)

  function syncFlags() {
    flags.canUndo = history.canUndo
    flags.canRedo = history.canRedo
  }

  function notifyCommit() {
    for (const fn of commitListeners) fn()
  }

  function onCommit(fn: () => void) {
    commitListeners.add(fn)
    return () => commitListeners.delete(fn)
  }

  function pruneSelection() {
    state.selection = state.selection.filter((id) => index.value.has(id))
    if (state.editingId && !index.value.has(state.editingId)) state.editingId = null
  }

  /** Replaces the whole board (initial load / import) and resets undo history. */
  function load(elements: BoardElement[]) {
    state.elements = elements
    state.selection = []
    state.editingId = null
    history.reset(snapshot())
    syncFlags()
  }

  /** Applies a newer board written by another tab, keeping local selection where possible. */
  function applyRemote(elements: BoardElement[]) {
    state.elements = elements
    pruneSelection()
    history.reset(snapshot())
    syncFlags()
  }

  /** Marks the end of a user action: records an undo step if anything changed. */
  function commit() {
    if (history.commit(snapshot())) {
      syncFlags()
      notifyCommit()
    }
  }

  function restore(snap: string) {
    state.elements = JSON.parse(snap) as BoardElement[]
    state.editingId = null
    pruneSelection()
    syncFlags()
    notifyCommit()
  }

  function undo() {
    if (state.editingId) return
    const snap = history.undo()
    if (snap !== null) restore(snap)
  }

  function redo() {
    if (state.editingId) return
    const snap = history.redo()
    if (snap !== null) restore(snap)
  }

  function add<T extends BoardElement>(el: T): T {
    state.elements.push(el)
    return state.elements[state.elements.length - 1] as T
  }

  function update(id: string, patch: Partial<BoardElement>) {
    const el = get(id)
    if (el) Object.assign(el, patch)
  }

  /** Removes elements plus any connectors attached to them. */
  function remove(ids: string[]) {
    const doomed = new Set(ids)
    for (const el of state.elements) {
      if (el.type !== 'connector') continue
      if ((el.from.id && doomed.has(el.from.id)) || (el.to.id && doomed.has(el.to.id))) doomed.add(el.id)
    }
    state.elements = state.elements.filter((e) => !doomed.has(e.id))
    state.selection = state.selection.filter((id) => !doomed.has(id))
    if (state.editingId && doomed.has(state.editingId)) state.editingId = null
  }

  function moveBy(ids: string[], dx: number, dy: number) {
    for (const id of ids) {
      const el = get(id)
      if (!el) continue
      if (el.type === 'connector') {
        for (const end of [el.from, el.to]) {
          if (!end.id || !get(end.id)) {
            end.x += dx
            end.y += dy
          }
        }
      } else {
        el.x += dx
        el.y += dy
      }
    }
  }

  /**
   * Inserts copies of `source` shifted by `offset`, with fresh ids. Connectors keep
   * their attachments when the attached element is copied too; otherwise that end is
   * detached and frozen where it was drawn.
   */
  function insertCopies(source: BoardElement[], offset: Point): string[] {
    const srcMap = new Map(source.map((e) => [e.id, e]))
    const lookup: Lookup = (id) => srcMap.get(id) ?? get(id)
    const idMap = new Map(source.map((e) => [e.id, uid()]))
    const created: string[] = []
    for (const el of source) {
      const copy = clone(el)
      copy.id = idMap.get(el.id)!
      if (copy.type === 'connector' && el.type === 'connector') {
        const resolved = resolveConnector(el, lookup)
        const ends = [
          [copy.from, resolved.start.p],
          [copy.to, resolved.end.p],
        ] as const
        for (const [end, p] of ends) {
          if (end.id && idMap.has(end.id)) {
            end.id = idMap.get(end.id)!
          } else {
            end.id = null
            end.side = null
            end.x = p.x + offset.x
            end.y = p.y + offset.y
          }
        }
      } else if (copy.type !== 'connector') {
        copy.x += offset.x
        copy.y += offset.y
      }
      state.elements.push(copy)
      created.push(copy.id)
    }
    return created
  }

  function duplicate(ids: string[], offset: Point = { x: 24, y: 24 }): string[] {
    const chosen = new Set(ids)
    for (const el of state.elements) {
      if (el.type === 'connector' && el.from.id && el.to.id && chosen.has(el.from.id) && chosen.has(el.to.id)) {
        chosen.add(el.id)
      }
    }
    return insertCopies(
      state.elements.filter((e) => chosen.has(e.id)),
      offset,
    )
  }

  function bringToFront(ids: string[]) {
    const set = new Set(ids)
    state.elements = [...state.elements.filter((e) => !set.has(e.id)), ...state.elements.filter((e) => set.has(e.id))]
  }

  function sendToBack(ids: string[]) {
    const set = new Set(ids)
    state.elements = [...state.elements.filter((e) => set.has(e.id)), ...state.elements.filter((e) => !set.has(e.id))]
  }

  /** Records the rendered size of an element without creating an undo step. */
  function measure(id: string, w: number, h: number) {
    const el = get(id)
    if (!el || el.type !== 'text') return
    if (el.autoWidth && Math.abs(el.w - w) > 0.5) el.w = w
    if (Math.abs(el.h - h) > 0.5) el.h = h
  }

  function select(ids: string[]) {
    state.selection = ids
  }

  function selectAll() {
    state.selection = state.elements.map((e) => e.id)
  }

  const isSelected = (id: string) => selectionSet.value.has(id)

  function startEditing(id: string) {
    const el = get(id)
    if (!el || el.type === 'path') return
    state.selection = [id]
    state.editingId = id
  }

  function stopEditing() {
    const id = state.editingId
    if (!id) return
    state.editingId = null
    const el = get(id)
    if (el && 'text' in el && !el.text.trim()) {
      if (el.type === 'text') remove([id])
      else el.text = ''
    }
    commit()
  }

  function setTool(tool: Tool) {
    if (state.editingId) stopEditing()
    state.tool = tool
  }

  // ---------------------------------------------------------------- viewport

  function screenToWorld(sx: number, sy: number): Point {
    const v = state.viewport
    return { x: (sx - v.x) / v.zoom, y: (sy - v.y) / v.zoom }
  }

  function worldToScreen(wx: number, wy: number): Point {
    const v = state.viewport
    return { x: wx * v.zoom + v.x, y: wy * v.zoom + v.y }
  }

  /** Zooms keeping the world point under screen position (sx, sy) fixed. */
  function zoomAt(sx: number, sy: number, zoom: number) {
    const v = state.viewport
    const z = clamp(zoom, MIN_ZOOM, MAX_ZOOM)
    const wx = (sx - v.x) / v.zoom
    const wy = (sy - v.y) / v.zoom
    v.x = sx - wx * z
    v.y = sy - wy * z
    v.zoom = z
  }

  function contentBounds(ids?: string[]): Rect | null {
    const els = ids ? ids.map((id) => get(id)).filter((e): e is BoardElement => !!e) : state.elements
    return unionRects(els.map((e) => elementBounds(e, get)))
  }

  function fitTo(rect: Rect, screenW: number, screenH: number, padding = 96, maxZoom = 1) {
    const z = clamp(
      Math.min((screenW - padding * 2) / Math.max(rect.w, 1), (screenH - padding * 2) / Math.max(rect.h, 1), maxZoom),
      MIN_ZOOM,
      MAX_ZOOM,
    )
    state.viewport.zoom = z
    state.viewport.x = screenW / 2 - (rect.x + rect.w / 2) * z
    state.viewport.y = screenH / 2 - (rect.y + rect.h / 2) * z
  }

  /** Topmost element of a connectable type whose box contains `p`. */
  function hitBox(p: Point, margin = 0, predicate: (el: BoardElement) => boolean = isBox): BoardElement | null {
    for (let i = state.elements.length - 1; i >= 0; i--) {
      const el = state.elements[i]!
      if (el.type === 'connector' || !predicate(el)) continue
      if (p.x >= el.x - margin && p.x <= el.x + el.w + margin && p.y >= el.y - margin && p.y <= el.y + el.h + margin) {
        return el
      }
    }
    return null
  }

  return {
    state,
    ui,
    flags,
    selected,
    get,
    isSelected,
    snapshot,
    load,
    applyRemote,
    commit,
    onCommit,
    undo,
    redo,
    add,
    update,
    remove,
    moveBy,
    insertCopies,
    duplicate,
    bringToFront,
    sendToBack,
    measure,
    select,
    selectAll,
    startEditing,
    stopEditing,
    setTool,
    screenToWorld,
    worldToScreen,
    zoomAt,
    contentBounds,
    fitTo,
    hitBox,
  }
}

export type Board = ReturnType<typeof createBoard>
