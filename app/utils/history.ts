/**
 * Snapshot-based undo history. Each snapshot is the serialised element list, so
 * committing after every finished gesture is cheap to reason about and never drifts.
 */
export function createHistory(limit = 200) {
  let past: string[] = []
  let future: string[] = []
  let present = '[]'

  return {
    reset(snapshot: string) {
      past = []
      future = []
      present = snapshot
    },
    /** Records `snapshot` as a new state. Returns false if nothing changed. */
    commit(snapshot: string): boolean {
      if (snapshot === present) return false
      past.push(present)
      if (past.length > limit) past.shift()
      present = snapshot
      future = []
      return true
    },
    undo(): string | null {
      const prev = past.pop()
      if (prev === undefined) return null
      future.push(present)
      present = prev
      return present
    },
    redo(): string | null {
      const next = future.pop()
      if (next === undefined) return null
      past.push(present)
      present = next
      return present
    },
    get canUndo() {
      return past.length > 0
    },
    get canRedo() {
      return future.length > 0
    },
    get present() {
      return present
    },
  }
}

export type History = ReturnType<typeof createHistory>
