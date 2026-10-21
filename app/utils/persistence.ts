/// <reference types="chrome" />
import { reactive, watch } from 'vue'
import type { Board } from './board'
import { MAX_ZOOM, MIN_ZOOM } from './board'
import { createConnector, createPath, createShape, createSticky, createText, uid } from './factory'
import { SIDES } from './geometry'
import type { BoardElement, ConnectorEnd, Side, Viewport } from './types'

export const BOARD_KEY = 'whiteboard:board'
export const VIEWPORT_KEY = 'whiteboard:viewport'
export const SCHEMA = 1

export interface StoredBoard {
  schema: number
  elements: BoardElement[]
  updatedAt: number
  clientId: string
}

export interface StorageAdapter {
  kind: 'chrome' | 'local' | 'memory'
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
  /** Calls back when `key` changes (including changes made by other tabs). */
  subscribe(key: string, cb: (value: unknown) => void): () => void
}

type ChromeArea = Pick<chrome.storage.StorageArea, 'get' | 'set' | 'onChanged'>

export function chromeStorage(area: ChromeArea): StorageAdapter {
  return {
    kind: 'chrome',
    async get(key) {
      const res = await area.get(key)
      return res[key]
    },
    async set(key, value) {
      await area.set({ [key]: value })
    },
    subscribe(key, cb) {
      const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
        if (key in changes) cb(changes[key]!.newValue)
      }
      area.onChanged.addListener(listener)
      return () => area.onChanged.removeListener(listener)
    },
  }
}

type EventTarget = Pick<Window, 'addEventListener' | 'removeEventListener'>

/** Fallback used by `nuxt dev` in a normal browser tab. */
export function webStorage(ls: Storage, target: EventTarget): StorageAdapter {
  return {
    kind: 'local',
    async get(key) {
      const raw = ls.getItem(key)
      return raw ? JSON.parse(raw) : undefined
    },
    async set(key, value) {
      ls.setItem(key, JSON.stringify(value))
    },
    subscribe(key, cb) {
      const handler = (e: StorageEvent) => {
        if (e.key === key && e.newValue) cb(JSON.parse(e.newValue))
      }
      target.addEventListener('storage', handler)
      return () => target.removeEventListener('storage', handler)
    },
  }
}

/** In-memory store; `emit` simulates a write from another tab. */
export function memoryStorage(initial: Record<string, unknown> = {}) {
  const data = new Map(Object.entries(initial))
  const subs = new Map<string, Set<(v: unknown) => void>>()
  const adapter: StorageAdapter & { data: Map<string, unknown>; emit(key: string, value: unknown): void } = {
    kind: 'memory',
    data,
    async get(key) {
      return data.get(key)
    },
    async set(key, value) {
      data.set(key, JSON.parse(JSON.stringify(value)))
      subs.get(key)?.forEach((cb) => cb(data.get(key)))
    },
    subscribe(key, cb) {
      if (!subs.has(key)) subs.set(key, new Set())
      subs.get(key)!.add(cb)
      return () => subs.get(key)?.delete(cb)
    },
    emit(key, value) {
      data.set(key, value)
      subs.get(key)?.forEach((cb) => cb(value))
    },
  }
  return adapter
}

export function detectStorage(): StorageAdapter {
  const c = (globalThis as { chrome?: typeof chrome }).chrome
  if (c?.storage?.local) return chromeStorage(c.storage.local)
  try {
    if (typeof localStorage !== 'undefined') return webStorage(localStorage, window)
  } catch {
    // Storage can be blocked (e.g. third-party contexts); fall through to memory.
  }
  return memoryStorage()
}

// ---------------------------------------------------------------------------
// Validation — anything read from storage or an imported file goes through here.
// ---------------------------------------------------------------------------

type Loose = Record<string, unknown>

function pick<T extends object>(defaults: T, src: Loose): T {
  const out = { ...defaults } as Loose
  for (const [k, d] of Object.entries(defaults)) {
    const v = src[k]
    if (typeof d === 'number') {
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
    } else if (typeof d === 'string' || typeof d === 'boolean') {
      if (typeof v === typeof d) out[k] = v
    }
  }
  return out as T
}

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback

function sanitizeEnd(raw: unknown): ConnectorEnd {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Loose
  const end = pick({ x: 0, y: 0 }, src)
  return {
    id: typeof src.id === 'string' && src.id ? src.id : null,
    side: SIDES.includes(src.side as Side) ? (src.side as Side) : null,
    x: end.x,
    y: end.y,
  }
}

function sanitizeOne(src: Loose): BoardElement | null {
  const id = src.id as string
  let el: BoardElement
  switch (src.type) {
    case 'sticky':
      el = pick(createSticky(0, 0), src)
      break
    case 'text':
      el = pick(createText(0, 0), src)
      el.align = oneOf(src.align, ['left', 'center', 'right'] as const, 'left')
      el.fontSize = Math.max(4, el.fontSize)
      break
    case 'shape':
      el = pick(createShape('rect', { x: 0, y: 0, w: 100, h: 100 }), src)
      el.shape = oneOf(src.shape, ['rect', 'rounded', 'ellipse', 'diamond'] as const, 'rect')
      el.align = oneOf(src.align, ['left', 'center', 'right'] as const, 'center')
      el.valign = oneOf(src.valign, ['top', 'middle', 'bottom'] as const, 'middle')
      break
    case 'path': {
      el = pick(createPath([0, 0], '#ffffff', 4), src)
      const pts = Array.isArray(src.points) ? src.points.filter((n) => typeof n === 'number' && Number.isFinite(n)) : []
      if (pts.length < 2) return null
      el.points = pts.length % 2 ? pts.slice(0, -1) : pts
      el.vw = Math.max(el.vw, 1)
      el.vh = Math.max(el.vh, 1)
      break
    }
    case 'connector': {
      el = pick(createConnector(sanitizeEnd(null), sanitizeEnd(null)), src)
      el.from = sanitizeEnd(src.from)
      el.to = sanitizeEnd(src.to)
      el.route = oneOf(src.route, ['straight', 'elbow', 'curve'] as const, 'curve')
      el.startCap = oneOf(src.startCap, ['none', 'arrow'] as const, 'none')
      el.endCap = oneOf(src.endCap, ['none', 'arrow'] as const, 'arrow')
      break
    }
    default:
      return null
  }
  el.id = id
  if (el.type !== 'connector') {
    el.w = Math.max(el.w, 1)
    el.h = Math.max(el.h, 1)
  }
  return el
}

export function sanitizeElements(raw: unknown): BoardElement[] {
  if (!Array.isArray(raw)) return []
  const out: BoardElement[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const src = item as Loose
    if (typeof src.id !== 'string' || !src.id || seen.has(src.id)) continue
    const el = sanitizeOne(src)
    if (!el) continue
    seen.add(el.id)
    out.push(el)
  }
  // Connector ends pointing at elements that no longer exist become free ends.
  for (const el of out) {
    if (el.type !== 'connector') continue
    for (const end of [el.from, el.to]) {
      if (end.id && !seen.has(end.id)) {
        end.id = null
        end.side = null
      }
    }
  }
  return out
}

export function parseStoredBoard(raw: unknown): StoredBoard | null {
  if (Array.isArray(raw)) return { schema: SCHEMA, elements: sanitizeElements(raw), updatedAt: 0, clientId: '' }
  if (!raw || typeof raw !== 'object') return null
  const src = raw as Loose
  if (!Array.isArray(src.elements)) return null
  return {
    schema: typeof src.schema === 'number' ? src.schema : SCHEMA,
    elements: sanitizeElements(src.elements),
    updatedAt: typeof src.updatedAt === 'number' ? src.updatedAt : 0,
    clientId: typeof src.clientId === 'string' ? src.clientId : '',
  }
}

export function parseViewport(raw: unknown): Viewport | null {
  if (!raw || typeof raw !== 'object') return null
  const { x, y, zoom } = raw as Loose
  if (![x, y, zoom].every((n) => typeof n === 'number' && Number.isFinite(n))) return null
  return { x: x as number, y: y as number, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom as number)) }
}

export function exportBoardJson(elements: BoardElement[]): string {
  return JSON.stringify({ app: 'whiteboard-tab', schema: SCHEMA, exportedAt: new Date().toISOString(), elements }, null, 2)
}

/** Accepts an exported file (or a bare element array). Returns null if it is not a board. */
export function parseImport(text: string): BoardElement[] | null {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  const doc = parseStoredBoard(data)
  return doc ? doc.elements : null
}

// ---------------------------------------------------------------------------
// Sync: load once, save on change (debounced, immediate after each action), and
// follow writes from other tabs so every open new-tab page shows the latest board.
// ---------------------------------------------------------------------------

export interface SyncOptions {
  debounceMs?: number
  clientId?: string
}

export function createSync(board: Board, storage: StorageAdapter, opts: SyncOptions = {}) {
  const clientId = opts.clientId ?? uid()
  const debounceMs = opts.debounceMs ?? 250
  const status = reactive({ error: null as string | null, lastSavedAt: 0 })
  let lastJson = ''
  let timer: ReturnType<typeof setTimeout> | null = null
  let viewportTimer: ReturnType<typeof setTimeout> | null = null
  const stops: Array<() => void> = []

  async function load() {
    const [rawBoard, rawViewport] = await Promise.all([storage.get(BOARD_KEY), storage.get(VIEWPORT_KEY)])
    const doc = parseStoredBoard(rawBoard)
    board.load(doc ? doc.elements : [])
    lastJson = board.snapshot()
    const vp = parseViewport(rawViewport)
    if (vp) Object.assign(board.state.viewport, vp)
    board.state.loaded = true
    return { hadBoard: !!doc, hadViewport: !!vp }
  }

  async function save() {
    if (timer) clearTimeout(timer)
    timer = null
    const json = board.snapshot()
    if (json === lastJson) return
    lastJson = json
    try {
      await storage.set(BOARD_KEY, {
        schema: SCHEMA,
        elements: JSON.parse(json),
        updatedAt: Date.now(),
        clientId,
      } satisfies StoredBoard)
      status.error = null
      status.lastSavedAt = Date.now()
    } catch (err) {
      lastJson = ''
      status.error = err instanceof Error ? err.message : String(err)
    }
  }

  async function saveViewport() {
    if (viewportTimer) clearTimeout(viewportTimer)
    viewportTimer = null
    const { x, y, zoom } = board.state.viewport
    try {
      await storage.set(VIEWPORT_KEY, { x, y, zoom })
    } catch {
      // Viewport is a convenience; ignore failures.
    }
  }

  function scheduleSave() {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void save(), debounceMs)
  }

  function scheduleViewportSave() {
    if (viewportTimer) clearTimeout(viewportTimer)
    viewportTimer = setTimeout(() => void saveViewport(), debounceMs * 2)
  }

  function applyIncoming(value: unknown) {
    const doc = parseStoredBoard(value)
    if (!doc || doc.clientId === clientId) return
    const json = JSON.stringify(doc.elements)
    if (json === lastJson) return
    lastJson = json
    board.applyRemote(doc.elements)
  }

  function start() {
    stops.push(watch(() => board.state.elements, scheduleSave, { deep: true }))
    stops.push(board.onCommit(() => void save()))
    stops.push(
      watch(
        () => [board.state.viewport.x, board.state.viewport.y, board.state.viewport.zoom],
        scheduleViewportSave,
      ),
    )
    stops.push(storage.subscribe(BOARD_KEY, applyIncoming))
  }

  /** Writes anything pending right now (used when the tab is hidden or closed). */
  async function flush() {
    await Promise.all([save(), viewportTimer ? saveViewport() : Promise.resolve()])
  }

  function stop() {
    for (const fn of stops.splice(0)) fn()
    if (timer) clearTimeout(timer)
    if (viewportTimer) clearTimeout(viewportTimer)
  }

  return { clientId, status, load, start, stop, save, flush }
}

export type Sync = ReturnType<typeof createSync>
