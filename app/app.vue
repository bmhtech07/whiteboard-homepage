<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import BoardCanvas from '~/components/BoardCanvas.vue'
import BoardMenu from '~/components/BoardMenu.vue'
import ContextToolbar from '~/components/ContextToolbar.vue'
import EmptyHint from '~/components/EmptyHint.vue'
import HelpPanel from '~/components/HelpPanel.vue'
import MainToolbar from '~/components/MainToolbar.vue'
import ZoomBar from '~/components/ZoomBar.vue'
import { useBoard, useBoardSync } from '~/composables/useBoard'

const board = useBoard()
const sync = useBoardSync()
const { state, ui } = board

function flush() {
  void sync.flush()
}
function onVisibility() {
  if (document.visibilityState === 'hidden') flush()
}

onMounted(async () => {
  const { hadViewport } = await sync.load()
  // First run: put the world origin in the middle of the screen.
  if (!hadViewport) Object.assign(state.viewport, { x: window.innerWidth / 2, y: window.innerHeight / 2, zoom: 1 })
  sync.start()
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', onVisibility)
})

onBeforeUnmount(() => {
  sync.stop()
  window.removeEventListener('pagehide', flush)
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<template>
  <main class="app" :data-loaded="state.loaded ? 'true' : undefined">
    <BoardCanvas />
    <EmptyHint v-if="state.loaded && !state.elements.length" />
    <MainToolbar />
    <ContextToolbar />
    <ZoomBar />
    <BoardMenu />
    <HelpPanel v-if="ui.showHelp" />
  </main>
</template>
