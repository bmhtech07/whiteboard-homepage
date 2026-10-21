import { describe, expect, it } from 'vitest'
import { createHistory } from '~/utils/history'

describe('history', () => {
  it('undoes and redoes snapshots', () => {
    const h = createHistory()
    h.reset('a')
    expect(h.commit('b')).toBe(true)
    expect(h.commit('c')).toBe(true)
    expect(h.undo()).toBe('b')
    expect(h.undo()).toBe('a')
    expect(h.undo()).toBeNull()
    expect(h.redo()).toBe('b')
    expect(h.canRedo).toBe(true)
  })
  it('ignores commits that change nothing', () => {
    const h = createHistory()
    h.reset('a')
    expect(h.commit('a')).toBe(false)
    expect(h.canUndo).toBe(false)
  })
  it('drops the redo stack after a new commit', () => {
    const h = createHistory()
    h.reset('a')
    h.commit('b')
    h.undo()
    h.commit('c')
    expect(h.canRedo).toBe(false)
    expect(h.undo()).toBe('a')
  })
  it('caps its length', () => {
    const h = createHistory(3)
    h.reset('0')
    for (let i = 1; i <= 10; i++) h.commit(String(i))
    let steps = 0
    while (h.undo() !== null) steps++
    expect(steps).toBe(3)
  })
})
