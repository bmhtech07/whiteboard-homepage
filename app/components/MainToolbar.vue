<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import { useBoard } from '~/composables/useBoard'
import { INK_COLORS, PEN_WIDTHS, STICKY_COLORS } from '~/utils/palette'
import type { ShapeKind, Tool } from '~/utils/types'

const board = useBoard()
const { state, flags } = board

const tools: { id: Tool; icon: string; label: string; key: string }[] = [
  { id: 'select', icon: 'select', label: 'Select', key: 'V' },
  { id: 'hand', icon: 'hand', label: 'Pan', key: 'H · Space' },
  { id: 'text', icon: 'text', label: 'Text', key: 'T' },
  { id: 'sticky', icon: 'sticky', label: 'Sticky note', key: 'S' },
  { id: 'shape', icon: 'rect', label: 'Shape', key: 'R · O · D' },
  { id: 'connector', icon: 'connector', label: 'Arrow', key: 'L' },
  { id: 'pen', icon: 'pen', label: 'Pen', key: 'P' },
]

const shapes: { kind: ShapeKind; label: string }[] = [
  { kind: 'rect', label: 'Rectangle' },
  { kind: 'rounded', label: 'Rounded rectangle' },
  { kind: 'ellipse', label: 'Ellipse' },
  { kind: 'diamond', label: 'Decision (diamond)' },
]
</script>

<template>
  <div class="main-toolbar" @mousedown.prevent>
    <nav class="panel tool-rail" aria-label="Tools">
      <div v-for="t in tools" :key="t.id" class="tool-slot">
        <button
          class="icon-btn"
          :class="{ active: state.tool === t.id }"
          :aria-label="t.label"
          :aria-pressed="state.tool === t.id"
          :data-tool="t.id"
          @click="board.setTool(t.id)"
        >
          <AppIcon :name="t.id === 'shape' ? state.shapeKind : t.icon" />
          <span class="tip">{{ t.label }} <kbd>{{ t.key }}</kbd></span>
        </button>

        <div v-if="t.id === 'sticky' && state.tool === 'sticky'" class="panel flyout swatch-grid">
          <button
            v-for="c in STICKY_COLORS"
            :key="c.value"
            class="swatch"
            :class="{ active: state.stickyColor === c.value }"
            :style="{ background: c.value }"
            :aria-label="`${c.name} sticky`"
            :title="c.name"
            @click="state.stickyColor = c.value"
          />
        </div>

        <div v-if="t.id === 'shape' && state.tool === 'shape'" class="panel flyout">
          <button
            v-for="s in shapes"
            :key="s.kind"
            class="icon-btn"
            :class="{ active: state.shapeKind === s.kind }"
            :aria-label="s.label"
            :title="s.label"
            :data-shape="s.kind"
            @click="state.shapeKind = s.kind"
          >
            <AppIcon :name="s.kind" />
          </button>
        </div>

        <div v-if="t.id === 'pen' && state.tool === 'pen'" class="panel flyout pen-flyout">
          <div class="swatch-grid">
            <button
              v-for="c in INK_COLORS"
              :key="c.value"
              class="swatch"
              :class="{ active: state.penColor === c.value }"
              :style="{ background: c.value }"
              :aria-label="`${c.name} ink`"
              :title="c.name"
              @click="state.penColor = c.value"
            />
          </div>
          <div class="flyout-row">
            <button
              v-for="w in PEN_WIDTHS"
              :key="w.value"
              class="icon-btn"
              :class="{ active: state.penWidth === w.value }"
              :aria-label="w.name"
              :title="w.name"
              @click="state.penWidth = w.value"
            >
              <span class="weight" :style="{ height: `${w.value}px` }" />
            </button>
          </div>
        </div>
      </div>

      <div class="sep" />

      <button class="icon-btn" aria-label="Undo" :disabled="!flags.canUndo" @click="board.undo()">
        <AppIcon name="undo" />
        <span class="tip">Undo <kbd>⌘Z</kbd></span>
      </button>
      <button class="icon-btn" aria-label="Redo" :disabled="!flags.canRedo" @click="board.redo()">
        <AppIcon name="redo" />
        <span class="tip">Redo <kbd>⇧⌘Z</kbd></span>
      </button>
    </nav>
  </div>
</template>
