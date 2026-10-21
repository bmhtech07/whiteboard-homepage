<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import { useBoard } from '~/composables/useBoard'

const { ui } = useBoard()

const groups = [
  {
    title: 'Tools',
    rows: [
      ['Select', 'V'],
      ['Pan', 'H  or hold Space'],
      ['Text', 'T'],
      ['Sticky note', 'S'],
      ['Rectangle · Ellipse · Diamond', 'R · O · D'],
      ['Arrow / connector', 'L'],
      ['Pen', 'P'],
    ],
  },
  {
    title: 'Editing',
    rows: [
      ['Add text', 'Double-click canvas'],
      ['Edit text', 'Double-click or Enter'],
      ['Finish editing', 'Esc or ⌘Enter'],
      ['Duplicate', '⌘D  or Alt-drag'],
      ['Copy · Paste', '⌘C · ⌘V'],
      ['Delete', '⌫'],
      ['Undo · Redo', '⌘Z · ⇧⌘Z'],
      ['Bring front · Send back', '] · ['],
      ['Nudge', 'Arrows (⇧ ×10)'],
    ],
  },
  {
    title: 'Canvas',
    rows: [
      ['Pan', 'Scroll / two-finger drag'],
      ['Zoom', '⌘ + scroll / pinch'],
      ['Zoom in · out · 100%', '⌘+ · ⌘− · ⌘0'],
      ['Fit everything', '⇧1'],
      ['Connect shapes', 'Drag or click a blue dot'],
      ['Scale text', 'Drag a text corner'],
    ],
  },
]
</script>

<template>
  <div class="help-backdrop" @pointerdown.self="ui.showHelp = false">
    <section class="panel help" role="dialog" aria-label="Keyboard shortcuts">
      <header>
        <h2>Shortcuts</h2>
        <button class="icon-btn" aria-label="Close" @click="ui.showHelp = false"><AppIcon name="close" :size="18" /></button>
      </header>
      <div class="help-grid">
        <div v-for="g in groups" :key="g.title">
          <h3>{{ g.title }}</h3>
          <dl>
            <template v-for="[label, keys] in g.rows" :key="label">
              <dt>{{ label }}</dt>
              <dd><kbd>{{ keys }}</kbd></dd>
            </template>
          </dl>
        </div>
      </div>
    </section>
  </div>
</template>
