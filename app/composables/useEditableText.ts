import { computed, nextTick, onMounted, watch, type Ref } from 'vue'
import { useBoard } from './useBoard'

function placeCaretAtEnd(node: HTMLElement) {
  const range = document.createRange()
  range.selectNodeContents(node)
  range.collapse(false)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

/**
 * Shared in-place text editing for stickies, text, shapes and connector labels.
 * The node's text is written imperatively so Vue never re-renders under the caret.
 */
export function useEditableText(id: () => string, text: () => string, node: Ref<HTMLElement | null>) {
  const board = useBoard()
  const editing = computed(() => board.state.editingId === id())

  function render() {
    const n = node.value
    if (n && !editing.value && n.textContent !== text()) n.textContent = text()
  }

  onMounted(render)
  watch(node, render)
  watch(text, render)

  watch(
    editing,
    async (on) => {
      if (on) {
        await nextTick()
        const n = node.value
        if (!n || !editing.value) return
        n.focus({ preventScroll: true })
        placeCaretAtEnd(n)
      } else {
        const n = node.value
        if (n && document.activeElement === n) n.blur()
        render()
      }
    },
    { immediate: true },
  )

  function onInput() {
    const n = node.value
    if (!n) return
    board.update(id(), { text: n.innerText.replace(/\n$/, '') })
  }

  function onBlur() {
    if (editing.value) board.stopEditing()
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
      e.preventDefault()
      e.stopPropagation()
      board.stopEditing()
    }
  }

  return { editing, onInput, onBlur, onKeydown }
}
