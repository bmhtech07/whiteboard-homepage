import { createBoard, type Board } from '~/utils/board'
import { createSync, detectStorage, type Sync } from '~/utils/persistence'

let board: Board | null = null
let sync: Sync | null = null

/** The single board store shared by every component on the page. */
export function useBoard(): Board {
  return (board ??= createBoard())
}

/** Persistence for the shared board (chrome.storage in the extension, localStorage in dev). */
export function useBoardSync(): Sync {
  return (sync ??= createSync(useBoard(), detectStorage()))
}
