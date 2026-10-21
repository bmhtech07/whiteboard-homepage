<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBoard } from '~/composables/useBoard'
import { useEditableText } from '~/composables/useEditableText'
import { arrowHead, connectorGeometry } from '~/utils/geometry'
import type { ConnectorElement } from '~/utils/types'

const props = defineProps<{ el: ConnectorElement }>()
const board = useBoard()
const textNode = ref<HTMLElement | null>(null)

// Reads the attached elements through board.get, so the line follows them as they move.
const g = computed(() => connectorGeometry(props.el, board.get))
const selected = computed(() => board.isSelected(props.el.id))
const dash = computed(() =>
  props.el.dashed ? `${props.el.strokeWidth * 3} ${props.el.strokeWidth * 2.5}` : undefined,
)

const { editing, onInput, onBlur, onKeydown } = useEditableText(
  () => props.el.id,
  () => props.el.text,
  textNode,
)
</script>

<template>
  <svg
    class="item connector-item"
    :data-id="el.id"
    :width="g.bounds.w"
    :height="g.bounds.h"
    :style="{ left: `${g.bounds.x}px`, top: `${g.bounds.y}px` }"
  >
    <g :transform="`translate(${-g.bounds.x} ${-g.bounds.y})`">
      <path class="hit" :d="g.d" />
      <path v-if="selected" class="halo" :d="g.d" :stroke-width="el.strokeWidth + 6" />
      <path
        :d="g.d"
        fill="none"
        :stroke="el.stroke"
        :stroke-width="el.strokeWidth"
        :stroke-dasharray="dash"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <polygon
        v-if="el.endCap === 'arrow'"
        class="cap"
        :points="arrowHead(g.end, g.endAngle, g.arrowSize)"
        :fill="el.stroke"
        :stroke="el.stroke"
        stroke-width="1.5"
        stroke-linejoin="round"
      />
      <polygon
        v-if="el.startCap === 'arrow'"
        class="cap"
        :points="arrowHead(g.start, g.startAngle, g.arrowSize)"
        :fill="el.stroke"
        :stroke="el.stroke"
        stroke-width="1.5"
        stroke-linejoin="round"
      />
    </g>
  </svg>
  <div
    v-if="el.text || editing"
    class="item connector-label"
    :class="{ editing }"
    :data-id="el.id"
    :style="{ left: `${g.mid.x}px`, top: `${g.mid.y}px`, color: el.stroke }"
  >
    <div
      ref="textNode"
      class="item-text"
      :contenteditable="editing ? 'plaintext-only' : 'false'"
      :data-editing="editing ? '' : undefined"
      spellcheck="false"
      @input="onInput"
      @blur="onBlur"
      @keydown="onKeydown"
    />
  </div>
</template>
