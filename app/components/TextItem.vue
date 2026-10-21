<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useBoard } from '~/composables/useBoard'
import { useEditableText } from '~/composables/useEditableText'
import type { TextElement } from '~/utils/types'

const props = defineProps<{ el: TextElement }>()
const board = useBoard()
const rootNode = ref<HTMLElement | null>(null)
const textNode = ref<HTMLElement | null>(null)

const { editing, onInput, onBlur, onKeydown } = useEditableText(
  () => props.el.id,
  () => props.el.text,
  textNode,
)

// The rendered size feeds back into the element so selection, hit-testing and
// connectors use the real text box.
let observer: ResizeObserver | undefined
onMounted(() => {
  observer = new ResizeObserver(() => {
    const n = rootNode.value
    if (n) board.measure(props.el.id, n.offsetWidth, n.offsetHeight)
  })
  observer.observe(rootNode.value!)
})
onBeforeUnmount(() => observer?.disconnect())

const style = computed(() => ({
  left: `${props.el.x}px`,
  top: `${props.el.y}px`,
  width: props.el.autoWidth ? 'max-content' : `${props.el.w}px`,
  fontSize: `${props.el.fontSize}px`,
  color: props.el.color,
  fontWeight: props.el.bold ? 700 : 400,
  textAlign: props.el.align,
}))
</script>

<template>
  <div
    ref="rootNode"
    class="item text-item"
    :class="{ auto: el.autoWidth, editing }"
    :data-id="el.id"
    :style="style"
  >
    <div
      ref="textNode"
      class="item-text"
      :contenteditable="editing ? 'plaintext-only' : 'false'"
      :data-editing="editing ? '' : undefined"
      data-placeholder="Type something"
      spellcheck="false"
      @input="onInput"
      @blur="onBlur"
      @keydown="onKeydown"
    />
  </div>
</template>
