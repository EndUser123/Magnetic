import type { Sequence } from './model'
import type { OpResult } from './ops'
import { validateSequence } from './validate'

/**
 * Snapshot-based undo. Ops return restore inverses, so a history entry is
 * just the {before, after} pair of sequence snapshots (cheap: sequences are
 * immutable and structurally shared). Groups coalesce multi-op commands into
 * a single undo step.
 */

export type Op = (seq: Sequence) => OpResult

interface HistoryEntry {
  before: Sequence
  after: Sequence
}

export class UndoStack {
  private past: HistoryEntry[] = []
  private future: HistoryEntry[] = []
  private present: Sequence
  private groupDepth = 0
  private groupBefore: Sequence | null = null

  constructor(initial: Sequence) {
    this.present = initial
  }

  get current(): Sequence {
    return this.present
  }

  get canUndo(): boolean {
    return this.past.length > 0
  }

  get canRedo(): boolean {
    return this.future.length > 0
  }

  /** Apply an op to the current sequence. Errors and clean no-ops leave no history. */
  apply(op: Op): OpResult {
    const result = op(this.present)
    if (result.error !== undefined || result.next === this.present) return result
    this.future = []
    if (this.groupDepth === 0) {
      this.past.push({ before: this.present, after: result.next })
    }
    this.present = result.next
    return result
  }

  beginGroup(): void {
    if (this.groupDepth === 0) this.groupBefore = this.present
    this.groupDepth += 1
  }

  endGroup(): void {
    if (this.groupDepth === 0) return
    this.groupDepth -= 1
    if (this.groupDepth > 0 || this.groupBefore === null) return
    const before = this.groupBefore
    this.groupBefore = null
    if (this.present !== before) {
      this.past.push({ before, after: this.present })
    }
  }

  undo(): Sequence {
    if (this.groupDepth > 0) return this.present
    const entry = this.past.pop()
    if (entry === undefined) return this.present
    this.future.push(entry)
    this.present = entry.before
    return this.present
  }

  redo(): Sequence {
    const entry = this.future.pop()
    if (entry === undefined) return this.present
    this.past.push(entry)
    this.present = entry.after
    return this.present
  }

  /**
   * Snapshot the history for durable storage. The cap bounds the auto-saved
   * library file: a long session keeps its most recent steps, not all of them.
   */
  serialize(pastCap = HISTORY_CAP): SerializedHistory {
    return {
      past: this.past.slice(-pastCap),
      future: this.future.slice(0, pastCap),
      present: this.present
    }
  }

  /**
   * Rebuild a stack from persisted history. Returns null when the present
   * state is missing or fails the kernel legality check — the caller then
   * falls back to a fresh stack on the stored sequence. Individual corrupt
   * history entries are dropped rather than rejecting the whole bundle.
   */
  static restore(data: SerializedHistory): UndoStack | null {
    if (data === null || typeof data !== 'object' || !('present' in data)) return null
    if (!isValidSnapshot(data.present)) return null
    const stack = new UndoStack(data.present)
    const valid = (entry: { before: Sequence; after: Sequence }): boolean =>
      entry !== null && typeof entry === 'object' && isValidSnapshot(entry.before) && isValidSnapshot(entry.after)
    stack.past = (Array.isArray(data.past) ? data.past : []).filter(valid)
    stack.future = (Array.isArray(data.future) ? data.future : []).filter(valid)
    return stack
  }
}

/** Cap so a long session cannot balloon the auto-saved library file. */
const HISTORY_CAP = 50

export interface SerializedHistory {
  past: Array<{ before: Sequence; after: Sequence }>
  future: Array<{ before: Sequence; after: Sequence }>
  present: Sequence
}

function isValidSnapshot(seq: Sequence): boolean {
  try {
    return validateSequence(seq).length === 0
  } catch {
    return false
  }
}
