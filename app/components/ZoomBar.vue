<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import { useActions } from '~/composables/useActions'
import { useBoard } from '~/composables/useBoard'

const { state } = useBoard()
const actions = useActions()
</script>

<template>
  <div class="panel zoom-bar" @mousedown.prevent>
    <button class="icon-btn" aria-label="Zoom out" title="Zoom out (⌘−)" @click="actions.zoomBy(0.8)">
      <AppIcon name="minus" :size="16" />
    </button>
    <button class="zoom-readout" title="Reset to 100% (⌘0)" data-testid="zoom" @click="actions.zoomTo(1)">
      {{ Math.round(state.viewport.zoom * 100) }}%
    </button>
    <button class="icon-btn" aria-label="Zoom in" title="Zoom in (⌘+)" @click="actions.zoomBy(1.25)">
      <AppIcon name="plus" :size="16" />
    </button>
    <button class="icon-btn" aria-label="Fit to content" title="Fit everything (⇧1)" @click="actions.fitContent()">
      <AppIcon name="fit" :size="16" />
    </button>
  </div>
</template>
