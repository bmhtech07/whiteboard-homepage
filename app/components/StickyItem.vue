<script setup lang="ts">
import { computed, ref } from 'vue'
import { useEditableText } from '~/composables/useEditableText'
import { useFitText } from '~/composables/useFitText'
import type { StickyElement } from '~/utils/types'

const props = defineProps<{ el: StickyElement }>()
const textNode = ref<HTMLElement | null>(null)

const pad = computed(() => Math.max(8, Math.min(props.el.w, props.el.h) * 0.09))
// Size of the peeled-back top-left corner; scales with the note.
const curl = computed(() => Math.max(8, Math.min(props.el.w, props.el.h) * 0.16))

// Page-curl geometry, in px relative to the note's top-left corner (c = curl size).
// The fold runs almost diagonally from (c, 0) to (0, c) with a gentle bend; the
// flap's free edges bow inward to a tip, like a corner rolling back on itself.
const r = (n: number) => Math.round(n * 100) / 100
const fold = (c: number) => `Q${r(c * 0.45)} ${r(c * 0.45)} ${r(c)} 0`
const paperClip = computed(() => {
  const c = r(curl.value)
  const { w, h } = props.el
  return `path('M${c} 0 L${w} 0 L${w} ${h} L0 ${h} L0 ${c} ${fold(c)} Z')`
})
const flapClip = computed(() => {
  const c = curl.value
  const tip = r(c * 0.96)
  return `path('M${r(c)} 0 Q${r(c * 0.84)} ${r(c * 0.5)} ${tip} ${tip} Q${r(c * 0.5)} ${r(c * 0.84)} 0 ${r(c)} ${fold(c)} Z')`
})
const { editing, onInput, onBlur, onKeydown } = useEditableText(
  () => props.el.id,
  () => props.el.text,
  textNode,
)
// Text fills the note: it grows with the note and shrinks as more is written.
useFitText(textNode, () => ({
  w: props.el.w - pad.value * 2,
  h: props.el.h - pad.value * 2,
  max: Math.min(props.el.w, props.el.h) * 0.2,
  text: props.el.text,
}))
</script>

<template>
  <div
    class="item sticky"
    :data-id="el.id"
    :style="{
      left: `${el.x}px`,
      top: `${el.y}px`,
      width: `${el.w}px`,
      height: `${el.h}px`,
      '--curl': `${curl}px`,
    }"
  >
    <div class="sticky-paper" :style="{ background: el.color, clipPath: paperClip }" />
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
    <div class="sticky-curl"><i :style="{ backgroundColor: el.color, clipPath: flapClip }" /></div>
  </div>
</template>
