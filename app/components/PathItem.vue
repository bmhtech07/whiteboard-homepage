<script setup lang="ts">
import { computed } from 'vue'
import { useBoard } from '~/composables/useBoard'
import { smoothPath } from '~/utils/geometry'
import type { PathElement } from '~/utils/types'

const props = defineProps<{ el: PathElement }>()
const board = useBoard()

// Points live in a vw × vh space; scaling them (instead of the SVG) keeps the stroke width even.
const d = computed(() => smoothPath(props.el.points, props.el.w / props.el.vw, props.el.h / props.el.vh))
const selected = computed(() => board.isSelected(props.el.id))
</script>

<template>
  <svg
    class="item path-item"
    :data-id="el.id"
    :width="el.w"
    :height="el.h"
    :style="{ left: `${el.x}px`, top: `${el.y}px` }"
  >
    <path class="hit" :d="d" :stroke-width="Math.max(el.strokeWidth + 10, 14)" />
    <path
      v-if="selected"
      class="halo"
      :d="d"
      :stroke-width="el.strokeWidth + 6"
    />
    <path
      :d="d"
      fill="none"
      :stroke="el.stroke"
      :stroke-width="el.strokeWidth"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>
