<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { useActions } from '~/composables/useActions'
import { useBoard, useBoardSync } from '~/composables/useBoard'
import { exportBoardJson, parseImport } from '~/utils/persistence'

const board = useBoard()
const sync = useBoardSync()
const actions = useActions()
const open = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const root = ref<HTMLElement | null>(null)

function exportBoard() {
  open.value = false
  const blob = new Blob([exportBoardJson(board.state.elements)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `whiteboard-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function importBoard(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  open.value = false
  if (!file) return
  const elements = parseImport(await file.text())
  if (!elements) {
    alert('That file is not a whiteboard export.')
    return
  }
  if (board.state.elements.length && !confirm('Replace the current board with the imported one? (You can undo this.)')) return
  board.state.elements = elements
  board.select([])
  board.commit()
  actions.fitContent()
}

function clearBoard() {
  open.value = false
  if (!board.state.elements.length) return
  if (!confirm('Clear everything on the board? (You can undo this.)')) return
  board.state.elements = []
  board.select([])
  board.commit()
}

function fit() {
  open.value = false
  actions.fitContent()
}

function help() {
  open.value = false
  board.ui.showHelp = true
}

function onDocDown(e: PointerEvent) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false
}
onMounted(() => document.addEventListener('pointerdown', onDocDown, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocDown, true))
</script>

<template>
  <div ref="root" class="board-menu" @mousedown.prevent>
    <button class="panel menu-trigger" aria-label="Board menu" :aria-expanded="open" @click="open = !open">
      <AppIcon name="menu" :size="18" />
      <span class="brand">Whiteboard</span>
      <span v-if="sync.status.error" class="save-error-dot" title="Changes could not be saved" />
    </button>
    <div v-if="open" class="panel menu" role="menu">
      <button role="menuitem" @click="fit"><AppIcon name="fit" :size="16" /> Fit to content <kbd>⇧1</kbd></button>
      <button role="menuitem" @click="exportBoard"><AppIcon name="download" :size="16" /> Export board…</button>
      <button role="menuitem" @click="fileInput?.click()"><AppIcon name="upload" :size="16" /> Import board…</button>
      <button role="menuitem" @click="help"><AppIcon name="keyboard" :size="16" /> Shortcuts <kbd>?</kbd></button>
      <div class="menu-sep" />
      <button role="menuitem" class="danger" @click="clearBoard"><AppIcon name="trash" :size="16" /> Clear board</button>
      <p v-if="sync.status.error" class="menu-note error">Couldn't save: {{ sync.status.error }}</p>
      <p v-else class="menu-note">Saved automatically in this browser.</p>
    </div>
    <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="importBoard" />
  </div>
</template>
