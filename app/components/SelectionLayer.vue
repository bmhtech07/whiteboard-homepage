<script setup lang="ts">
import { computed } from 'vue'
import { useBoard } from '~/composables/useBoard'
import { ALL_HANDLES, SIDES, SIDE_DIR, isBox, isConnectable, resolveConnector, sidePoint } from '~/utils/geometry'
import type { BoxElement, Handle, Point, Rect } from '~/utils/types'

// Screen-space overlay: outlines, resize handles and connection dots stay the same
// size at every zoom level.
const board = useBoard()
const { state, ui } = board

function toScreen(r: Rect) {
  const { x, y, zoom } = state.viewport
  return { left: r.x * zoom + x, top: r.y * zoom + y, width: r.w * zoom, height: r.h * zoom }
}
const px = (r: ReturnType<typeof toScreen>) => ({
  left: `${r.left}px`,
  top: `${r.top}px`,
  width: `${r.width}px`,
  height: `${r.height}px`,
})
const pt = (p: Point) => board.worldToScreen(p.x, p.y)

const single = computed(() => (state.selection.length === 1 ? (board.get(state.selection[0]!) ?? null) : null))

const outlines = computed(() =>
  board.selected.value.filter(isBox).map((el) => ({ id: el.id, style: px(toScreen(el)) })),
)

const groupBox = computed(() => {
  if (state.selection.length < 2) return null
  const b = board.contentBounds(state.selection)
  return b ? px(toScreen(b)) : null
})

const hoverBox = computed(() => {
  if (ui.interacting || !ui.hoverId || board.isSelected(ui.hoverId)) return null
  const el = board.get(ui.hoverId)
  return isBox(el) ? px(toScreen(el)) : null
})

const handles = computed(() => {
  const el = single.value
  if (!el || !isBox(el) || state.editingId === el.id) return []
  const r = toScreen(el)
  let list: Handle[] = el.type === 'text' ? ['nw', 'ne', 'se', 'sw', 'e', 'w'] : ALL_HANDLES
  // Side handles get in the way on tiny elements.
  if (r.width < 36) list = list.filter((h) => h !== 'n' && h !== 's')
  if (r.height < 36) list = list.filter((h) => h !== 'e' && h !== 'w')
  return list.map((h) => ({
    h,
    left: r.left + (h.includes('w') ? 0 : h.includes('e') ? r.width : r.width / 2),
    top: r.top + (h.includes('n') ? 0 : h.includes('s') ? r.height : r.height / 2),
  }))
})

const ends = computed(() => {
  const el = single.value
  if (!el || el.type !== 'connector' || state.editingId === el.id) return []
  const { start, end } = resolveConnector(el, board.get)
  return [
    { end: 'from', p: pt(start.p) },
    { end: 'to', p: pt(end.p) },
  ]
})

const anchorEl = computed<BoxElement | null>(() => {
  if (state.tool !== 'select' && state.tool !== 'connector') return null
  if (ui.interacting) {
    const t = ui.connectTarget ? board.get(ui.connectTarget.id) : null
    return isConnectable(t) ? t : null
  }
  const sel = single.value
  const id = ui.hoverId ?? (sel && isConnectable(sel) ? sel.id : null)
  if (!id || id === state.editingId) return null
  const el = board.get(id)
  return isConnectable(el) ? el : null
})

const anchors = computed(() => {
  const el = anchorEl.value
  if (!el) return []
  return SIDES.map((side) => {
    const p = pt(sidePoint(el, side))
    return {
      side,
      id: el.id,
      left: p.x + SIDE_DIR[side].x * 14,
      top: p.y + SIDE_DIR[side].y * 14,
      active: ui.connectTarget?.id === el.id && ui.connectTarget.side === side,
    }
  })
})

const targetBox = computed(() => {
  if (!ui.connectTarget) return null
  const el = board.get(ui.connectTarget.id)
  return isBox(el) ? px(toScreen(el)) : null
})

const marquee = computed(() => (ui.marquee ? px(toScreen(ui.marquee)) : null))
</script>

<template>
  <div class="selection-layer">
    <div v-if="hoverBox" class="hover-outline" :style="hoverBox" />
    <div v-for="o in outlines" :key="o.id" class="sel-outline" :style="o.style" />
    <div v-if="groupBox" class="sel-group" :style="groupBox" />
    <div v-if="targetBox" class="connect-target" :style="targetBox" />
    <div v-if="marquee" class="marquee" :style="marquee" />
    <template v-if="single">
      <div
        v-for="h in handles"
        :key="h.h"
        class="handle"
        :class="`h-${h.h}`"
        :data-handle="h.h"
        :data-for="single.id"
        :style="{ left: `${h.left}px`, top: `${h.top}px` }"
      />
      <div
        v-for="e in ends"
        :key="e.end"
        class="end-handle"
        :data-end="e.end"
        :data-for="single.id"
        :style="{ left: `${e.p.x}px`, top: `${e.p.y}px` }"
      />
    </template>
    <div
      v-for="a in anchors"
      :key="a.side"
      class="anchor"
      :class="{ active: a.active }"
      :data-anchor="a.side"
      :data-for="a.id"
      :style="{ left: `${a.left}px`, top: `${a.top}px` }"
    />
  </div>
</template>
