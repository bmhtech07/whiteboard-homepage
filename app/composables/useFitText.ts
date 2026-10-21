import { onMounted, watch, type Ref } from 'vue'
import { fitNodeText } from '~/utils/textFit'

/**
 * Keeps `node`'s font size at the largest value (≤ max) whose text fits in the
 * available box, so text grows when the box is enlarged and shrinks when reduced.
 */
export function useFitText(
  node: Ref<HTMLElement | null>,
  box: () => { w: number; h: number; max: number; text: string },
  min = 6,
) {
  function fit() {
    const n = node.value
    if (!n) return
    const { w, h, max } = box()
    n.style.width = `${Math.max(w, 1)}px`
    fitNodeText(n, Math.max(w, 1), Math.max(h, 1), min, max)
  }
  onMounted(() => {
    fit()
    document.fonts?.ready.then(fit).catch(() => {})
  })
  watch(box, fit, { flush: 'post' })
  return { fit }
}
