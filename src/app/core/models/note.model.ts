/**
 * A single sticky note on the board.
 *
 * Notes are stored flat (see `BoardState`) rather than as a nested tree: reparenting is then a
 * single field write, which keeps the sync events small and order-independent.
 */
export interface Note {
  id: string;
  typeId: string;
  /** null = the note sits directly on the board. */
  parentId: string | null;
  text: string;
  /** World coordinates. Only meaningful while `parentId` is null. */
  x: number;
  y: number;
  /** Sort key among siblings (or among roots). Sparse, so inserts rarely need a renumber. */
  order: number;
  /** userIds that voted for this note. One vote per user. */
  votes: string[];
  createdBy: string;
  collapsed: boolean;
  updatedAt: number;
}

export interface BoardState {
  notes: Record<string, Note>;
}

export const EMPTY_BOARD: BoardState = { notes: {} };

/** Walks up the parent chain. Used for the drag cycle guard. */
export function isDescendantOf(state: BoardState, candidateId: string, ancestorId: string): boolean {
  let cursor = state.notes[candidateId]?.parentId ?? null;
  while (cursor) {
    if (cursor === ancestorId) return true;
    cursor = state.notes[cursor]?.parentId ?? null;
  }
  return false;
}

/** The note plus every note beneath it, deepest last. */
export function subtreeIds(state: BoardState, rootId: string): string[] {
  const out: string[] = [];
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    out.push(id);
    for (const note of Object.values(state.notes)) {
      if (note.parentId === id) queue.push(note.id);
    }
  }
  return out;
}
