<script setup lang="ts">
import { computed, ref } from 'vue'
import { useEditableText } from '~/composables/useEditableText'
import { useFitText } from '~/composables/useFitText'
import { STICKY_INK, isLight } from '~/utils/palette'
import type { ShapeElement } from '~/utils/types'

const props = defineProps<{ el: ShapeElement }>()
const textNode = ref<HTMLElement | null>(null)

const half = computed(() => props.el.strokeWidth / 2)

// Text area inside each outline, so labels stay within diamonds and ellipses.
const inset = computed(() => {
  const { w, h, shape } = props.el
  if (shape === 'diamond') return { x: w * 0.24, y: h * 0.22 }
  if (shape === 'ellipse') return { x: w * 0.15, y: h * 0.14 }
  if (shape === 'rounded') return { x: Math.min(w, h) * 0.12 + 6, y: 8 }
  return { x: 10, y: 8 }
})

const FLEX = { top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const

const textColor = computed(() =>
  isLight(props.el.fill) && isLight(props.el.textColor) ? STICKY_INK : props.el.textColor,
)

const diamondPoints = computed(() => {
  const { w, h } = props.el
  const s = half.value
  return `${w / 2},${s} ${w - s},${h / 2} ${w / 2},${h - s} ${s},${h / 2}`
})

const { editing, onInput, onBlur, onKeydown } = useEditableText(
  () => props.el.id,
  () => props.el.text,
  textNode,
)
useFitText(textNode, () => ({
  w: props.el.w - inset.value.x * 2,
  h: props.el.h - inset.value.y * 2,
  max: props.el.fontSize,
  text: props.el.text,
}))
</script>

<template>
  <div
    class="item shape-item"
    :data-id="el.id"
    :style="{ left: `${el.x}px`, top: `${el.y}px`, width: `${el.w}px`, height: `${el.h}px` }"
  >
    <svg class="shape-svg" :width="el.w" :height="el.h">
      <rect
        v-if="el.shape === 'rect' || el.shape === 'rounded'"
        :x="half"
        :y="half"
        :width="Math.max(el.w - el.strokeWidth, 0)"
        :height="Math.max(el.h - el.strokeWidth, 0)"
        :rx="el.shape === 'rounded' ? Math.min(el.w, el.h) * 0.22 : 4"
        :fill="el.fill"
        :stroke="el.stroke"
        :stroke-width="el.strokeWidth"
      />
      <ellipse
        v-else-if="el.shape === 'ellipse'"
        :cx="el.w / 2"
        :cy="el.h / 2"
        :rx="Math.max(el.w / 2 - half, 0)"
        :ry="Math.max(el.h / 2 - half, 0)"
        :fill="el.fill"
        :stroke="el.stroke"
        :stroke-width="el.strokeWidth"
      />
      <polygon
        v-else
        :points="diamondPoints"
        :fill="el.fill"
        :stroke="el.stroke"
        :stroke-width="el.strokeWidth"
        stroke-linejoin="round"
      />
    </svg>
    <div
      class="shape-label"
      :style="{
        left: `${inset.x}px`,
        right: `${inset.x}px`,
        top: `${inset.y}px`,
        bottom: `${inset.y}px`,
        alignItems: FLEX[el.valign],
      }"
    >
      <div
        ref="textNode"
        class="item-text"
        :style="{ color: textColor, textAlign: el.align }"
        :contenteditable="editing ? 'plaintext-only' : 'false'"
        :data-editing="editing ? '' : undefined"
        spellcheck="false"
        @input="onInput"
        @blur="onBlur"
        @keydown="onKeydown"
      />
    </div>
  </div>
</template>
