<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { useActions } from '~/composables/useActions'
import { useBoard } from '~/composables/useBoard'
import { clamp } from '~/utils/geometry'
import { FILL_COLORS, INK_COLORS, PEN_WIDTHS, STICKY_COLORS, type Swatch } from '~/utils/palette'
import type {
  BoardElement,
  ConnectorElement,
  PathElement,
  Route,
  ShapeElement,
  ShapeKind,
  StickyElement,
  TextElement,
  VAlign,
} from '~/utils/types'

const board = useBoard()
const actions = useActions()
const { state, ui } = board
const node = ref<HTMLElement | null>(null)
const width = ref(0)

type Panel = 'ink' | 'fill' | 'position' | null
const panel = ref<Panel>(null)

const sel = board.selected
const kind = computed(() => {
  const types = new Set(sel.value.map((e) => e.type))
  return types.size === 1 ? [...types][0]! : 'mixed'
})
const first = computed(() => sel.value[0])

const visible = computed(() => sel.value.length > 0 && !ui.interacting && state.tool === 'select')

watch(
  () => state.selection.join(','),
  () => (panel.value = null),
)

// Re-measure whenever the contents change so the toolbar can be kept on screen.
watch(
  [visible, kind, panel],
  async () => {
    await nextTick()
    width.value = node.value?.offsetWidth ?? 0
  },
  { immediate: true },
)

const position = computed(() => {
  const b = board.contentBounds(state.selection)
  if (!b) return null
  const { x, y, zoom } = state.viewport
  const cx = (b.x + b.w / 2) * zoom + x
  const top = b.y * zoom + y
  const bottom = (b.y + b.h) * zoom + y
  const half = width.value / 2
  const left = clamp(cx, half + 12, Math.max(half + 12, window.innerWidth - half - 12))
  const above = top - 64 > 12
  return {
    left: `${left}px`,
    top: `${above ? top - 58 : Math.min(bottom + 14, window.innerHeight - 120)}px`,
  }
})

function apply<T extends BoardElement>(fn: (el: T) => void) {
  for (const el of sel.value) fn(el as T)
  board.commit()
}

const SIZE_STEPS = [10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96, 128, 160, 200, 256]
function stepSize(current: number, dir: 1 | -1, max = 256) {
  const next =
    dir > 0 ? SIZE_STEPS.find((s) => s > current + 0.5) : [...SIZE_STEPS].reverse().find((s) => s < current - 0.5)
  return Math.min(next ?? current, max)
}

const inkValue = computed(() => {
  const el = first.value
  if (!el) return ''
  if (el.type === 'text') return el.color
  if (el.type === 'shape' || el.type === 'connector' || el.type === 'path') return el.stroke
  return ''
})

const fillValue = computed(() => (first.value?.type === 'shape' ? first.value.fill : ''))

function setInk(c: Swatch) {
  apply((el: BoardElement) => {
    if (el.type === 'text') el.color = c.value
    else if (el.type === 'shape' || el.type === 'connector' || el.type === 'path') el.stroke = c.value
  })
}

const shapeKinds: { kind: ShapeKind; label: string }[] = [
  { kind: 'rect', label: 'Rectangle' },
  { kind: 'rounded', label: 'Rounded' },
  { kind: 'ellipse', label: 'Ellipse' },
  { kind: 'diamond', label: 'Diamond' },
]
const routes: { route: Route; label: string }[] = [
  { route: 'straight', label: 'Straight' },
  { route: 'elbow', label: 'Elbow' },
  { route: 'curve', label: 'Curved' },
]
const CONNECTOR_WIDTHS = [1.5, 2, 3.5]
const nextAlign = { left: 'center', center: 'right', right: 'left' } as const

// Label position inside shapes: a 3×3 grid of vertical × horizontal placements.
const VALIGNS: VAlign[] = ['top', 'middle', 'bottom']
const ALIGNS: TextElement['align'][] = ['left', 'center', 'right']
const FLEX_H = { left: 'flex-start', center: 'center', right: 'flex-end' } as const
const FLEX_V = { top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const
const shapePos = computed(() => {
  const el = first.value
  return el?.type === 'shape' ? { align: el.align, valign: el.valign } : { align: 'center', valign: 'middle' } as const
})
function setPosition(align: TextElement['align'], valign: VAlign) {
  apply((el: ShapeElement) => Object.assign(el, { align, valign }))
}

// Toggles read the first element once so a multi-selection ends up consistent.
function toggleBold() {
  const bold = !(first.value as TextElement).bold
  apply((el: TextElement) => (el.bold = bold))
}
function cycleAlign() {
  const align = nextAlign[(first.value as TextElement).align]
  apply((el: TextElement) => (el.align = align))
}
function toggleCap(key: 'startCap' | 'endCap') {
  const cap = (first.value as ConnectorElement)[key] === 'arrow' ? 'none' : 'arrow'
  apply((el: ConnectorElement) => (el[key] = cap))
}
function toggleDashed() {
  const dashed = !(first.value as ConnectorElement).dashed
  apply((el: ConnectorElement) => (el.dashed = dashed))
}
</script>

<template>
  <div
    v-if="visible && position"
    ref="node"
    class="context-toolbar"
    :style="position"
    data-testid="context-toolbar"
    @mousedown.prevent
  >
    <div class="panel ctx-row">
      <!-- Sticky notes: colour swatches inline -->
      <template v-if="kind === 'sticky'">
        <button
          v-for="c in STICKY_COLORS"
          :key="c.value"
          class="swatch"
          :class="{ active: (first as StickyElement).color === c.value }"
          :style="{ background: c.value }"
          :aria-label="`${c.name} sticky`"
          :title="c.name"
          :data-color="c.name"
          @click="apply((el: StickyElement) => (el.color = c.value))"
        />
        <div class="sep-v" />
      </template>

      <!-- Text -->
      <template v-if="kind === 'text'">
        <button
          class="icon-btn"
          aria-label="Text colour"
          title="Colour"
          :class="{ active: panel === 'ink' }"
          @click="panel = panel === 'ink' ? null : 'ink'"
        >
          <span class="swatch-dot" :style="{ background: inkValue }" />
        </button>
        <button
          class="icon-btn"
          aria-label="Smaller text"
          title="Smaller"
          @click="apply((el: TextElement) => (el.fontSize = stepSize(el.fontSize, -1)))"
        >
          <AppIcon name="minus" :size="16" />
        </button>
        <span class="size-readout" data-testid="font-size">{{ Math.round((first as TextElement).fontSize) }}</span>
        <button
          class="icon-btn"
          aria-label="Larger text"
          title="Larger"
          @click="apply((el: TextElement) => (el.fontSize = stepSize(el.fontSize, 1)))"
        >
          <AppIcon name="plus" :size="16" />
        </button>
        <button
          class="icon-btn"
          aria-label="Bold"
          title="Bold"
          :class="{ active: (first as TextElement).bold }"
          @click="toggleBold"
        >
          <AppIcon name="bold" :size="18" />
        </button>
        <button
          class="icon-btn"
          aria-label="Alignment"
          title="Alignment"
          @click="cycleAlign"
        >
          <AppIcon :name="`align-${(first as TextElement).align}`" :size="18" />
        </button>
        <div class="sep-v" />
      </template>

      <!-- Shapes -->
      <template v-if="kind === 'shape'">
        <button
          v-for="s in shapeKinds"
          :key="s.kind"
          class="icon-btn"
          :class="{ active: (first as ShapeElement).shape === s.kind }"
          :aria-label="s.label"
          :title="s.label"
          @click="apply((el: ShapeElement) => (el.shape = s.kind))"
        >
          <AppIcon :name="s.kind" :size="18" />
        </button>
        <div class="sep-v" />
        <button
          class="icon-btn"
          aria-label="Border colour"
          title="Border"
          :class="{ active: panel === 'ink' }"
          @click="panel = panel === 'ink' ? null : 'ink'"
        >
          <span class="swatch-ring" :style="{ borderColor: inkValue }" />
        </button>
        <button
          class="icon-btn"
          aria-label="Fill colour"
          title="Fill"
          :class="{ active: panel === 'fill' }"
          @click="panel = panel === 'fill' ? null : 'fill'"
        >
          <span class="swatch-dot" :class="{ empty: fillValue === 'transparent' }" :style="{ background: fillValue }" />
        </button>
        <button
          class="icon-btn"
          aria-label="Smaller text"
          title="Smaller text"
          @click="apply((el: ShapeElement) => (el.fontSize = stepSize(el.fontSize, -1, 96)))"
        >
          <AppIcon name="minus" :size="16" />
        </button>
        <span class="size-readout">{{ (first as ShapeElement).fontSize }}</span>
        <button
          class="icon-btn"
          aria-label="Larger text"
          title="Larger text"
          @click="apply((el: ShapeElement) => (el.fontSize = stepSize(el.fontSize, 1, 96)))"
        >
          <AppIcon name="plus" :size="16" />
        </button>
        <button
          class="icon-btn"
          aria-label="Text position"
          title="Text position"
          :class="{ active: panel === 'position' }"
          @click="panel = panel === 'position' ? null : 'position'"
        >
          <span
            class="pos-glyph"
            :style="{ justifyContent: FLEX_H[shapePos.align], alignItems: FLEX_V[shapePos.valign] }"
          >
            <i />
          </span>
        </button>
        <div class="sep-v" />
      </template>

      <!-- Connectors -->
      <template v-if="kind === 'connector'">
        <button
          class="icon-btn"
          aria-label="Line colour"
          title="Colour"
          :class="{ active: panel === 'ink' }"
          @click="panel = panel === 'ink' ? null : 'ink'"
        >
          <span class="swatch-dot" :style="{ background: inkValue }" />
        </button>
        <button
          v-for="r in routes"
          :key="r.route"
          class="icon-btn"
          :class="{ active: (first as ConnectorElement).route === r.route }"
          :aria-label="r.label"
          :title="r.label"
          @click="apply((el: ConnectorElement) => (el.route = r.route))"
        >
          <AppIcon :name="r.route" :size="18" />
        </button>
        <div class="sep-v" />
        <button
          class="icon-btn"
          aria-label="Start arrow"
          title="Start arrow"
          :class="{ active: (first as ConnectorElement).startCap === 'arrow' }"
          @click="toggleCap('startCap')"
        >
          <AppIcon name="arrow-start" :size="18" />
        </button>
        <button
          class="icon-btn"
          aria-label="End arrow"
          title="End arrow"
          :class="{ active: (first as ConnectorElement).endCap === 'arrow' }"
          @click="toggleCap('endCap')"
        >
          <AppIcon name="arrow-end" :size="18" />
        </button>
        <button
          class="icon-btn"
          aria-label="Dashed"
          title="Dashed"
          :class="{ active: (first as ConnectorElement).dashed }"
          @click="toggleDashed"
        >
          <AppIcon name="dashed" :size="18" />
        </button>
        <button
          v-for="w in CONNECTOR_WIDTHS"
          :key="w"
          class="icon-btn"
          :class="{ active: (first as ConnectorElement).strokeWidth === w }"
          :aria-label="`Line weight ${w}`"
          :title="`Weight ${w}`"
          @click="apply((el: ConnectorElement) => (el.strokeWidth = w))"
        >
          <span class="weight" :style="{ height: `${w}px` }" />
        </button>
        <div class="sep-v" />
      </template>

      <!-- Freehand -->
      <template v-if="kind === 'path'">
        <button
          class="icon-btn"
          aria-label="Ink colour"
          title="Colour"
          :class="{ active: panel === 'ink' }"
          @click="panel = panel === 'ink' ? null : 'ink'"
        >
          <span class="swatch-dot" :style="{ background: inkValue }" />
        </button>
        <button
          v-for="w in PEN_WIDTHS"
          :key="w.value"
          class="icon-btn"
          :class="{ active: (first as PathElement).strokeWidth === w.value }"
          :aria-label="w.name"
          :title="w.name"
          @click="apply((el: PathElement) => (el.strokeWidth = w.value))"
        >
          <span class="weight" :style="{ height: `${w.value}px` }" />
        </button>
        <div class="sep-v" />
      </template>

      <button class="icon-btn" aria-label="Duplicate" title="Duplicate (⌘D)" @click="actions.duplicateSelection()">
        <AppIcon name="duplicate" :size="18" />
      </button>
      <button class="icon-btn" aria-label="Bring to front" title="Bring to front ( ] )" @click="actions.bringToFront()">
        <AppIcon name="front" :size="18" />
      </button>
      <button class="icon-btn" aria-label="Send to back" title="Send to back ( [ )" @click="actions.sendToBack()">
        <AppIcon name="back" :size="18" />
      </button>
      <button class="icon-btn danger" aria-label="Delete" title="Delete (⌫)" @click="actions.deleteSelection()">
        <AppIcon name="trash" :size="18" />
      </button>
    </div>

    <div v-if="panel === 'position'" class="panel ctx-panel position-grid" role="group" aria-label="Text position">
      <template v-for="v in VALIGNS" :key="v">
        <button
          v-for="h in ALIGNS"
          :key="h"
          class="pos-cell"
          :class="{ active: shapePos.align === h && shapePos.valign === v }"
          :aria-label="`Text ${v} ${h}`"
          :title="`${v[0]!.toUpperCase()}${v.slice(1)} ${h}`"
          :data-pos="`${v}-${h}`"
          @click="setPosition(h, v)"
        >
          <i />
        </button>
      </template>
    </div>

    <div v-else-if="panel" class="panel ctx-panel swatch-grid">
      <button
        v-for="c in panel === 'fill' ? FILL_COLORS : INK_COLORS"
        :key="c.value"
        class="swatch"
        :class="{ active: (panel === 'fill' ? fillValue : inkValue) === c.value, empty: c.value === 'transparent' }"
        :style="{ background: c.value }"
        :aria-label="c.name"
        :title="c.name"
        @click="
          panel === 'fill' ? apply((el: BoardElement) => el.type === 'shape' && (el.fill = c.value)) : setInk(c)
        "
      />
    </div>
  </div>
</template>
