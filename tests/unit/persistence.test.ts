import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBoard } from '~/utils/board'
import { createConnector, createPath, createShape, createSticky, createText } from '~/utils/factory'
import {
  BOARD_KEY,
  VIEWPORT_KEY,
  chromeStorage,
  createSync,
  memoryStorage,
  parseImport,
  sanitizeElements,
  webStorage,
} from '~/utils/persistence'
import type { StickyElement } from '~/utils/types'

describe('sanitizeElements', () => {
  it('drops junk, fills defaults and fixes dangling connector ends', () => {
    const sticky = createSticky(0, 0)
    const out = sanitizeElements([
      null,
      'nope',
      { id: 'x', type: 'unknown' },
      { id: '', type: 'sticky' },
      { ...sticky, w: 'wide', color: 42 },
      { ...sticky }, // duplicate id
      { id: 't1', type: 'text', text: 'hi', fontSize: 30 },
      { id: 'c1', type: 'connector', from: { id: sticky.id, side: 'left' }, to: { id: 'ghost', side: 'bogus', x: 5, y: 6 } },
      { id: 'p1', type: 'path', points: [1, 2, 3] },
    ])
    expect(out.map((e) => e.id)).toEqual([sticky.id, 't1', 'c1', 'p1'])
    const s = out[0] as StickyElement
    expect(s.w).toBe(200)
    expect(typeof s.color).toBe('string')
    const t = out[1]!
    expect(t.type === 'text' && t.fontSize).toBe(30)
    const c = out[2]!
    expect(c.type === 'connector' && c.from).toMatchObject({ id: sticky.id, side: 'left' })
    expect(c.type === 'connector' && c.to).toMatchObject({ id: null, side: null, x: 5, y: 6 })
    const p = out[3]!
    expect(p.type === 'path' && p.points).toEqual([1, 2])
  })

  it('round-trips real elements unchanged', () => {
    const els = [
      createSticky(10, 10),
      createText(0, 0, { text: 'hello' }),
      createPath([0, 0, 10, 10, 20, 5], '#fff', 4),
      createConnector({ id: null, side: null, x: 0, y: 0 }, { id: null, side: null, x: 5, y: 5 }),
    ]
    expect(sanitizeElements(JSON.parse(JSON.stringify(els)))).toEqual(els)
  })
})

describe('shape text position', () => {
  it('defaults to centred for older boards and rejects unknown values', () => {
    const shape = createShape('rect', { x: 0, y: 0, w: 100, h: 60 })
    const { align: _a, valign: _v, ...legacy } = shape
    const [fromLegacy, explicit, bogus] = sanitizeElements([
      legacy,
      { ...shape, id: 's2', align: 'right', valign: 'bottom' },
      { ...shape, id: 's3', align: 'sideways', valign: 42 },
    ])
    expect(fromLegacy).toMatchObject({ align: 'center', valign: 'middle' })
    expect(explicit).toMatchObject({ align: 'right', valign: 'bottom' })
    expect(bogus).toMatchObject({ align: 'center', valign: 'middle' })
  })
})

describe('parseImport', () => {
  it('accepts exported files and bare arrays, rejects junk', () => {
    const s = createSticky(0, 0)
    expect(parseImport(JSON.stringify({ app: 'whiteboard-tab', elements: [s] }))).toEqual([s])
    expect(parseImport(JSON.stringify([s]))).toEqual([s])
    expect(parseImport('not json')).toBeNull()
    expect(parseImport('{"foo": 1}')).toBeNull()
  })
})

describe('createSync', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('loads saved state and viewport', async () => {
    const s = createSticky(0, 0)
    const storage = memoryStorage({
      [BOARD_KEY]: { schema: 1, elements: [s], updatedAt: 1, clientId: 'other' },
      [VIEWPORT_KEY]: { x: 10, y: 20, zoom: 2 },
    })
    const board = createBoard()
    const sync = createSync(board, storage)
    await sync.load()
    expect(board.state.elements).toEqual([s])
    expect(board.state.viewport).toEqual({ x: 10, y: 20, zoom: 2 })
    expect(board.state.loaded).toBe(true)
  })

  it('saves immediately on commit and debounced on other edits', async () => {
    const storage = memoryStorage()
    const board = createBoard()
    const sync = createSync(board, storage, { debounceMs: 200 })
    await sync.load()
    sync.start()

    const s = board.add(createSticky(0, 0))
    board.commit()
    await Promise.resolve()
    expect((storage.data.get(BOARD_KEY) as { elements: unknown[] }).elements).toHaveLength(1)

    s.text = 'typing...'
    await nextTick()
    expect((storage.data.get(BOARD_KEY) as { elements: StickyElement[] }).elements[0]!.text).toBe('')
    await vi.advanceTimersByTimeAsync(250)
    expect((storage.data.get(BOARD_KEY) as { elements: StickyElement[] }).elements[0]!.text).toBe('typing...')
    sync.stop()
  })

  it('applies writes from other tabs and ignores its own echoes', async () => {
    const storage = memoryStorage()
    const board = createBoard()
    const sync = createSync(board, storage, { debounceMs: 50 })
    await sync.load()
    sync.start()

    board.add(createSticky(0, 0))
    board.commit()
    await vi.runAllTimersAsync()
    const setSpy = vi.spyOn(storage, 'set')

    const remote = [createSticky(0, 0), createSticky(300, 0)]
    storage.emit(BOARD_KEY, { schema: 1, elements: remote, updatedAt: Date.now(), clientId: 'another-tab' })
    expect(board.state.elements.map((e) => e.id)).toEqual(remote.map((e) => e.id))

    // Applying the remote board must not bounce it straight back to storage.
    await nextTick()
    await vi.runAllTimersAsync()
    expect(setSpy).not.toHaveBeenCalled()

    // Our own write echoed back is ignored.
    storage.emit(BOARD_KEY, { schema: 1, elements: [], updatedAt: Date.now(), clientId: sync.clientId })
    expect(board.state.elements).toHaveLength(2)
    sync.stop()
  })

  it('two tabs converge on the latest edit', async () => {
    const storage = memoryStorage()
    const tabA = createBoard()
    const tabB = createBoard()
    const syncA = createSync(tabA, storage, { debounceMs: 10 })
    const syncB = createSync(tabB, storage, { debounceMs: 10 })
    await syncA.load()
    await syncB.load()
    syncA.start()
    syncB.start()

    tabA.add(createSticky(0, 0, '#FBE38E'))
    tabA.commit()
    await vi.runAllTimersAsync()
    expect(tabB.state.elements).toHaveLength(1)

    tabB.remove([tabB.state.elements[0]!.id])
    tabB.commit()
    await vi.runAllTimersAsync()
    expect(tabA.state.elements).toHaveLength(0)
    syncA.stop()
    syncB.stop()
  })

  it('reports storage failures', async () => {
    const storage = memoryStorage()
    storage.set = () => Promise.reject(new Error('QUOTA_BYTES quota exceeded'))
    const board = createBoard()
    const sync = createSync(board, storage)
    await sync.load()
    sync.start()
    board.add(createSticky(0, 0))
    board.commit()
    await vi.runAllTimersAsync()
    expect(sync.status.error).toMatch(/quota/)
    sync.stop()
  })
})

describe('storage adapters', () => {
  it('chromeStorage reads, writes and listens through the storage area', async () => {
    const data: Record<string, unknown> = {}
    const listeners = new Set<(changes: Record<string, { newValue?: unknown }>) => void>()
    const area = {
      get: async (key: string) => ({ [key]: data[key] }),
      set: async (items: Record<string, unknown>) => {
        Object.assign(data, items)
        const changes = Object.fromEntries(Object.entries(items).map(([k, v]) => [k, { newValue: v }]))
        listeners.forEach((l) => l(changes))
      },
      onChanged: { addListener: (l: never) => listeners.add(l), removeListener: (l: never) => listeners.delete(l) },
    }
    const adapter = chromeStorage(area as never)
    const seen: unknown[] = []
    const unsub = adapter.subscribe('k', (v) => seen.push(v))
    await adapter.set('k', { a: 1 })
    expect(await adapter.get('k')).toEqual({ a: 1 })
    expect(seen).toEqual([{ a: 1 }])
    unsub()
    await adapter.set('k', { a: 2 })
    expect(seen).toHaveLength(1)
  })

  it('webStorage round-trips JSON and follows storage events', async () => {
    const map = new Map<string, string>()
    const ls = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
    } as Storage
    const handlers = new Set<(e: StorageEvent) => void>()
    const target = {
      addEventListener: (_: string, h: (e: StorageEvent) => void) => handlers.add(h),
      removeEventListener: (_: string, h: (e: StorageEvent) => void) => handlers.delete(h),
    } as unknown as Window
    const adapter = webStorage(ls, target)
    await adapter.set('k', [1, 2])
    expect(await adapter.get('k')).toEqual([1, 2])
    const seen: unknown[] = []
    adapter.subscribe('k', (v) => seen.push(v))
    handlers.forEach((h) => h({ key: 'k', newValue: '{"b":2}' } as StorageEvent))
    handlers.forEach((h) => h({ key: 'other', newValue: '1' } as StorageEvent))
    expect(seen).toEqual([{ b: 2 }])
  })
})
