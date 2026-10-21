<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ConnectorItem from './ConnectorItem.vue'
import PathItem from './PathItem.vue'
import SelectionLayer from './SelectionLayer.vue'
import ShapeItem from './ShapeItem.vue'
import StickyItem from './StickyItem.vue'
import TextItem from './TextItem.vue'
import { useBoard } from '~/composables/useBoard'
import { useShortcuts } from '~/composables/useShortcuts'
import {
  createConnector,
  createPath,
  createShape,
  createSticky,
  createText,
  defaultShapeSize,
  freeEnd,
} from '~/utils/factory'
import {
  SIDES,
  SIDE_DIR,
  clamp,
  cornerScale,
  distance,
  elementBounds,
  isBox,
  isConnectable,
  isCorner,
  pointInRect,
  rectFromPoints,
  rectsIntersect,
  resizeRect,
  scaleRectFromCorner,
  sidePoint,
  smoothPath,
} from '~/utils/geometry'
import type { BoardElement, ConnectorElement, ConnectorEnd, Handle, Point, Rect, Side } from '~/utils/types'

type Drag =
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { kind: 'marquee'; start: Point; base: string[] }
  | {
      kind: 'move'
      last: Point
      startScreen: Point
      moved: boolean
      alt: boolean
      toggleOff: string | null
      selectOnly: string | null
    }
  | { kind: 'resize'; id: string; handle: Handle; start: Point; rect: Rect; fontSize: number }
  | { kind: 'place'; id: string }
  | { kind: 'shape'; start: Point; startScreen: Point; id: string | null }
  | {
      kind: 'end'
      id: string
      end: 'from' | 'to'
      creating: boolean
      startScreen: Point
      moved: boolean
      /** Started from a connection dot: a plain click keeps drawing until the next click. */
      fromAnchor?: boolean
      /** Click-to-connect: the line follows the pointer with no button held. */
      following?: boolean
    }
  | { kind: 'pen' }

const board = useBoard()
const { state, ui } = board
const root = ref<HTMLElement | null>(null)
const draft = ref<number[] | null>(null)

let drag: Drag | null = null
let lastDown = { time: 0, x: 0, y: 0, id: null as string | null }
let pointerWorld: Point | null = null

useShortcuts({ pointer: () => pointerWorld })

const worldStyle = computed(() => ({
  transform: `translate(${state.viewport.x}px, ${state.viewport.y}px) scale(${state.viewport.zoom})`,
  '--zoom': state.viewport.zoom,
}))

const gridStyle = computed(() => {
  let size = 24 * state.viewport.zoom
  while (size < 14) size *= 2
  while (size > 64) size /= 2
  return {
    backgroundSize: `${size}px ${size}px`,
    backgroundPosition: `${state.viewport.x - size / 2}px ${state.viewport.y - size / 2}px`,
  }
})

const draftD = computed(() => (draft.value ? smoothPath(draft.value) : ''))

const rootClass = computed(() => [
  `tool-${state.tool}`,
  { panning: ui.panning, 'space-pan': ui.spaceDown && !ui.panning },
])

const round1 = (n: number) => Math.round(n * 10) / 10

function local(e: MouseEvent): Point {
  const r = root.value!.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

const editable = (el: BoardElement | undefined) => !!el && el.type !== 'path'

// ---------------------------------------------------------------- pointer down

function onPointerDown(e: PointerEvent) {
  if (e.button === 2) return
  if (drag?.kind === 'end' && drag.following) {
    finishFollowing(drag)
    return
  }
  const target = e.target as Element
  if (target.closest('[data-editing]')) return // let the browser place the caret

  const hitId = target.closest<HTMLElement | SVGElement>('[data-id]')?.dataset.id ?? null
  if (state.editingId) {
    if (hitId === state.editingId && state.tool === 'select') return
    board.stopEditing()
  }

  const screen = local(e)
  const world = board.screenToWorld(screen.x, screen.y)
  const now = performance.now()
  const isDouble =
    now - lastDown.time < 400 && distance(screen, lastDown) < 8 && lastDown.id === hitId && e.button === 0
  lastDown = { time: isDouble ? 0 : now, x: screen.x, y: screen.y, id: hitId }

  root.value?.setPointerCapture(e.pointerId)
  ui.interacting = true

  if (e.button === 1 || ui.spaceDown || state.tool === 'hand') {
    drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: state.viewport.x, vy: state.viewport.y }
    ui.panning = true
    return
  }

  const handle = target.closest<HTMLElement>('[data-handle]')
  if (handle) return startResize(handle.dataset.for!, handle.dataset.handle as Handle, world)

  const endHandle = target.closest<HTMLElement>('[data-end]')
  if (endHandle) {
    drag = {
      kind: 'end',
      id: endHandle.dataset.for!,
      end: endHandle.dataset.end as 'from' | 'to',
      creating: false,
      startScreen: screen,
      moved: false,
    }
    return
  }

  const anchor = target.closest<HTMLElement>('[data-anchor]')
  if (anchor) return startConnector(world, screen, anchor.dataset.for!, anchor.dataset.anchor as Side)

  const hit = hitId ? board.get(hitId) : undefined

  switch (state.tool) {
    case 'select':
      return selectDown(e, hitId, world, screen, isDouble)
    case 'text':
    case 'sticky': {
      // The text tool edits existing text in place; the sticky tool always adds a new note.
      if (state.tool === 'text' && hit && editable(hit) && hit.type !== 'connector') {
        drag = { kind: 'place', id: hit.id }
      } else {
        const el =
          state.tool === 'text'
            ? board.add(createText(world.x, world.y))
            : board.add(createSticky(world.x, world.y, state.stickyColor))
        board.select([el.id])
        drag = { kind: 'place', id: el.id }
      }
      state.tool = 'select'
      return
    }
    case 'shape':
      drag = { kind: 'shape', start: world, startScreen: screen, id: null }
      return
    case 'connector':
      return startConnector(world, screen, hit && isConnectable(hit) ? hit.id : null, null)
    case 'pen':
      draft.value = [round1(world.x), round1(world.y)]
      drag = { kind: 'pen' }
  }
}

function selectDown(e: PointerEvent, hitId: string | null, world: Point, screen: Point, isDouble: boolean) {
  if (!hitId) {
    if (isDouble) {
      const t = board.add(createText(world.x, world.y))
      board.select([t.id])
      drag = { kind: 'place', id: t.id }
      return
    }
    const base = e.shiftKey ? [...state.selection] : []
    board.select(base)
    drag = { kind: 'marquee', start: world, base }
    return
  }

  if (isDouble && editable(board.get(hitId))) {
    board.select([hitId])
    drag = { kind: 'place', id: hitId }
    return
  }

  let toggleOff: string | null = null
  let selectOnly: string | null = null
  if (e.shiftKey) {
    if (board.isSelected(hitId)) toggleOff = hitId
    else board.select([...state.selection, hitId])
  } else if (!board.isSelected(hitId)) {
    board.select([hitId])
  } else if (state.selection.length > 1) {
    selectOnly = hitId
  }
  drag = { kind: 'move', last: world, startScreen: screen, moved: false, alt: e.altKey, toggleOff, selectOnly }
}

function startResize(id: string, handle: Handle, world: Point) {
  const el = board.get(id)
  if (!el || !isBox(el)) return
  drag = {
    kind: 'resize',
    id,
    handle,
    start: world,
    rect: { x: el.x, y: el.y, w: el.w, h: el.h },
    fontSize: el.type === 'text' ? el.fontSize : 0,
  }
}

function startConnector(world: Point, screen: Point, fromId: string | null, side: Side | null) {
  const from: ConnectorEnd = fromId ? { id: fromId, side, x: world.x, y: world.y } : freeEnd(world.x, world.y)
  const c = board.add(createConnector(from, freeEnd(world.x, world.y)))
  drag = { kind: 'end', id: c.id, end: 'to', creating: true, startScreen: screen, moved: false, fromAnchor: !!side }
}

/** Ends a click-to-connect line: keep it if it reaches somewhere, otherwise drop it. */
function finishFollowing(d: Extract<Drag, { kind: 'end' }>, cancel = false) {
  drag = null
  ui.interacting = false
  ui.connectTarget = null
  state.tool = 'select'
  const c = board.get(d.id)
  if (cancel || !d.moved || c?.type !== 'connector') board.remove([d.id])
  else board.select([d.id])
  board.commit()
}

// Esc abandons a line that is following the pointer.
function onKeyDownCapture(e: KeyboardEvent) {
  if (e.key === 'Escape' && drag?.kind === 'end' && drag.following) {
    e.preventDefault()
    e.stopPropagation()
    finishFollowing(drag, true)
  }
}
onMounted(() => window.addEventListener('keydown', onKeyDownCapture, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDownCapture, true))

// ---------------------------------------------------------------- pointer move

/** Where a dragged connector end should attach: an element side, an element, or nowhere. */
function snapEnd(c: ConnectorElement, which: 'from' | 'to', world: Point): ConnectorEnd {
  const otherId = (which === 'to' ? c.from : c.to).id
  const z = state.viewport.zoom
  const accept = (el: BoardElement) => isConnectable(el) && el.id !== otherId
  const target = board.hitBox(world, 0, accept) ?? board.hitBox(world, 20 / z, accept)
  if (!target || !isBox(target)) {
    ui.connectTarget = null
    return freeEnd(world.x, world.y)
  }
  let side: Side | null = null
  let best = 22 / z
  for (const s of SIDES) {
    const p = sidePoint(target, s)
    const dot = { x: p.x + (SIDE_DIR[s].x * 14) / z, y: p.y + (SIDE_DIR[s].y * 14) / z }
    const d = Math.min(distance(p, world), distance(dot, world))
    if (d < best) {
      best = d
      side = s
    }
  }
  ui.connectTarget = { id: target.id, side }
  return { id: target.id, side, x: world.x, y: world.y }
}

function updateHover(world: Point, anchorFor: string | null) {
  if (state.tool !== 'select' && state.tool !== 'connector') {
    ui.hoverId = null
    return
  }
  if (anchorFor) {
    ui.hoverId = anchorFor
    return
  }
  const z = state.viewport.zoom
  const direct = board.hitBox(world, 0, isConnectable)
  if (direct) {
    ui.hoverId = direct.id
    return
  }
  // Outside every element: stay with the current one while the pointer is in the
  // band around it where its dots sit, so a neighbour can't steal the hover.
  const current = ui.hoverId ? board.get(ui.hoverId) : undefined
  if (isConnectable(current) && pointInRect(world, current, 36 / z)) return
  ui.hoverId = board.hitBox(world, 28 / z, isConnectable)?.id ?? null
}

function onPointerMove(e: PointerEvent) {
  const screen = local(e)
  const world = board.screenToWorld(screen.x, screen.y)
  pointerWorld = world
  const d = drag
  if (!d) {
    updateHover(world, (e.target as Element).closest<HTMLElement>('[data-anchor]')?.dataset.for ?? null)
    return
  }

  switch (d.kind) {
    case 'pan':
      state.viewport.x = d.vx + e.clientX - d.sx
      state.viewport.y = d.vy + e.clientY - d.sy
      return

    case 'marquee': {
      const r = rectFromPoints(d.start, world)
      ui.marquee = r
      const hits = state.elements.filter((el) => rectsIntersect(r, elementBounds(el, board.get))).map((el) => el.id)
      board.select([...new Set([...d.base, ...hits])])
      return
    }

    case 'move': {
      if (!d.moved) {
        if (distance(screen, d.startScreen) < 3) return
        d.moved = true
        ui.hoverId = null
        if (d.alt) board.select(board.duplicate(state.selection, { x: 0, y: 0 }))
      }
      board.moveBy(state.selection, world.x - d.last.x, world.y - d.last.y)
      d.last = world
      return
    }

    case 'resize':
      return applyResize(d, world, e.shiftKey)

    case 'shape': {
      if (!d.id) {
        if (distance(screen, d.startScreen) < 4) return
        const s = board.add(createShape(state.shapeKind, rectFromPoints(d.start, world)))
        d.id = s.id
        board.select([s.id])
      }
      let r = rectFromPoints(d.start, world)
      if (e.shiftKey) {
        const m = Math.max(r.w, r.h)
        r = {
          x: world.x < d.start.x ? d.start.x - m : d.start.x,
          y: world.y < d.start.y ? d.start.y - m : d.start.y,
          w: m,
          h: m,
        }
      }
      board.update(d.id, r)
      return
    }

    case 'end': {
      if (!d.moved && distance(screen, d.startScreen) < 4) return
      d.moved = true
      const c = board.get(d.id)
      if (c?.type === 'connector') c[d.end] = snapEnd(c, d.end, world)
      return
    }

    case 'pen': {
      const pts = draft.value
      if (!pts) return
      const lx = pts[pts.length - 2]!
      const ly = pts[pts.length - 1]!
      if (Math.hypot(world.x - lx, world.y - ly) * state.viewport.zoom < 2) return
      pts.push(round1(world.x), round1(world.y))
      return
    }
  }
}

function applyResize(d: Extract<Drag, { kind: 'resize' }>, world: Point, shift: boolean) {
  const el = board.get(d.id)
  if (!el || !isBox(el)) return
  const delta = { x: world.x - d.start.x, y: world.y - d.start.y }

  if (el.type === 'text') {
    if (isCorner(d.handle)) {
      // Corner drags scale the text itself: bigger box, bigger font.
      const s = clamp(cornerScale(d.rect, d.handle, delta), 6 / d.fontSize, 600 / d.fontSize)
      const r = scaleRectFromCorner(d.rect, d.handle, s)
      Object.assign(el, { ...r, fontSize: Math.round(d.fontSize * s * 10) / 10 })
    } else {
      // Side drags set a wrapping width instead.
      const r = resizeRect(d.rect, d.handle, delta.x, 0, false, Math.max(d.fontSize, 16))
      Object.assign(el, { x: r.x, w: r.w, autoWidth: false })
    }
    return
  }
  Object.assign(el, resizeRect(d.rect, d.handle, delta.x, delta.y, shift, 16))
}

// ---------------------------------------------------------------- pointer up

function onPointerUp(e: PointerEvent) {
  const d = drag
  drag = null
  ui.interacting = false
  ui.panning = false
  ui.marquee = null
  ui.connectTarget = null
  if (root.value?.hasPointerCapture(e.pointerId)) root.value.releasePointerCapture(e.pointerId)
  if (!d) return

  switch (d.kind) {
    case 'move':
      if (d.moved) board.commit()
      else if (d.toggleOff) board.select(state.selection.filter((id) => id !== d.toggleOff))
      else if (d.selectOnly) board.select([d.selectOnly])
      return

    case 'resize':
      board.commit()
      return

    case 'place':
      board.startEditing(d.id)
      return

    case 'shape': {
      let id = d.id
      if (!id) {
        const size = defaultShapeSize(state.shapeKind)
        id = board.add(
          createShape(state.shapeKind, { x: d.start.x - size.w / 2, y: d.start.y - size.h / 2, ...size }),
        ).id
      } else {
        const el = board.get(id)
        if (el && isBox(el)) Object.assign(el, { w: Math.max(el.w, 16), h: Math.max(el.h, 16) })
      }
      state.tool = 'select'
      board.startEditing(id)
      return
    }

    case 'end': {
      if (d.creating && d.fromAnchor && !d.moved) {
        drag = { ...d, following: true }
        ui.interacting = true
        return
      }
      if (d.creating) {
        state.tool = 'select'
        if (!d.moved) board.remove([d.id])
        else board.select([d.id])
      }
      board.commit()
      return
    }

    case 'pen': {
      const pts = draft.value
      draft.value = null
      if (pts && pts.length >= 2) {
        board.add(createPath(pts, state.penColor, state.penWidth))
        board.commit()
      }
      return
    }
  }
}

function onPointerLeave() {
  if (!drag) ui.hoverId = null
  pointerWorld = null
}

/** Keep focus where it is (e.g. inside a note being edited) unless clicking into editable text. */
function onMouseDown(e: MouseEvent) {
  if (!(e.target as Element).closest('[data-editing]')) e.preventDefault()
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  const scale = e.deltaMode === 1 ? 16 : 1
  if (e.ctrlKey || e.metaKey) {
    // Trackpad pinch arrives as ctrl+wheel with small deltas; mouse wheels send big ones.
    const p = local(e)
    const dy = clamp(e.deltaY * scale, -40, 40)
    board.zoomAt(p.x, p.y, state.viewport.zoom * Math.exp(-dy * 0.008))
  } else {
    state.viewport.x -= e.deltaX * scale
    state.viewport.y -= e.deltaY * scale
  }
}
</script>

<template>
  <div
    ref="root"
    class="board"
    :class="rootClass"
    data-testid="board"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @pointerleave="onPointerLeave"
    @mousedown="onMouseDown"
    @wheel="onWheel"
    @contextmenu.prevent
  >
    <div class="board-grid" :style="gridStyle" />
    <div v-if="state.loaded" class="board-world" :style="worldStyle">
      <template v-for="el in state.elements" :key="el.id">
        <StickyItem v-if="el.type === 'sticky'" :el="el" />
        <TextItem v-else-if="el.type === 'text'" :el="el" />
        <ShapeItem v-else-if="el.type === 'shape'" :el="el" />
        <PathItem v-else-if="el.type === 'path'" :el="el" />
        <ConnectorItem v-else-if="el.type === 'connector'" :el="el" />
      </template>
      <svg v-if="draft" class="draft-path" width="1" height="1">
        <path
          :d="draftD"
          :stroke="state.penColor"
          :stroke-width="state.penWidth"
          fill="none"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </div>
    <SelectionLayer />
  </div>
</template>
