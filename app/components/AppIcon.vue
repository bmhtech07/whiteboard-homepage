<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 20 })

// 24×24 stroke icons (drawn in the style of Lucide).
const ICONS: Record<string, string[]> = {
  select: [
    'M4.04 4.69a.5.5 0 0 1 .65-.65l16 6.5a.5.5 0 0 1-.06.95l-6.13 1.58a2 2 0 0 0-1.43 1.43l-1.58 6.13a.5.5 0 0 1-.95.06z',
  ],
  hand: [
    'M18 11V6a2 2 0 0 0-4 0',
    'M14 10V4a2 2 0 0 0-4 0v2',
    'M10 10.5V6a2 2 0 0 0-4 0v8',
    'M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15',
  ],
  text: ['M4 7V4h16v3', 'M9 20h6', 'M12 4v16'],
  sticky: ['M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8z', 'M15 3v4a2 2 0 0 0 2 2h4'],
  rect: ['M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  rounded: ['M3 10a5 5 0 0 1 5-5h8a5 5 0 0 1 5 5v4a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5z'],
  ellipse: ['M3 12a9 7 0 1 0 18 0a9 7 0 1 0-18 0'],
  diamond: ['M12 2.8 21.2 12 12 21.2 2.8 12z'],
  connector: ['M5 19 19 5', 'M9 5h10v10'],
  pen: ['M12 20h9', 'M16.4 3.6a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z'],
  undo: ['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'],
  redo: ['m15 14 5-5-5-5', 'M20 9H9.5a5.5 5.5 0 0 0 0 11H13'],
  trash: [
    'M3 6h18',
    'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6',
    'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
    'M10 11v6',
    'M14 11v6',
  ],
  duplicate: [
    'M10 8h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z',
    'M4 16a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2',
  ],
  front: ['M5 3h14', 'M12 21V8', 'm6 13 6-6 6 6'],
  back: ['M5 21h14', 'M12 3v13', 'm6 11 6 6 6-6'],
  bold: ['M7 5h6a3.5 3.5 0 0 1 0 7H7z', 'M7 12h7a3.5 3.5 0 0 1 0 7H7z'],
  'align-left': ['M3 6h18', 'M3 12h12', 'M3 18h15'],
  'align-center': ['M3 6h18', 'M6 12h12', 'M4.5 18h15'],
  'align-right': ['M3 6h18', 'M9 12h12', 'M6 18h15'],
  minus: ['M5 12h14'],
  plus: ['M5 12h14', 'M12 5v14'],
  fit: [
    'M8 3H5a2 2 0 0 0-2 2v3',
    'M21 8V5a2 2 0 0 0-2-2h-3',
    'M3 16v3a2 2 0 0 0 2 2h3',
    'M16 21h3a2 2 0 0 0 2-2v-3',
  ],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  help: ['M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0', 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3', 'M12 17h.01'],
  straight: ['M4 20 20 4'],
  elbow: ['M4 19h8V5h8'],
  curve: ['M4 20c0-9 16-7 16-16'],
  'arrow-end': ['M4 12h15', 'm13 6 6 6-6 6'],
  'arrow-start': ['M20 12H5', 'm11 6-6 6 6 6'],
  dashed: ['M3 12h4', 'M10 12h4', 'M17 12h4'],
  download: ['M12 3v12', 'm7 10 5 5 5-5', 'M5 21h14'],
  upload: ['M12 15V3', 'm7 8 5-5 5 5', 'M5 21h14'],
  close: ['M18 6 6 18', 'm6 6 12 12'],
  keyboard: [
    'M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z',
    'M6 10h.01',
    'M10 10h.01',
    'M14 10h.01',
    'M18 10h.01',
    'M8 14h8',
  ],
  eraser: ['m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L13 21', 'M22 21H7', 'm5 11 9 9'],
}

const paths = computed(() => ICONS[props.name] ?? [])
</script>

<template>
  <svg
    class="icon"
    viewBox="0 0 24 24"
    :width="size"
    :height="size"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-for="d in paths" :key="d" :d="d" />
  </svg>
</template>
