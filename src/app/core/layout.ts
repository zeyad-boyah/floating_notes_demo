import { BoardState, SIDES, Side } from './models/note.model';

/** Every note is the same square. Fixed size is what makes the docking layout predictable. */
export const NOTE_SIZE = 180;
/** Space between a parent square and the squares docked to it. */
export const NOTE_GAP = 14;

export type { Side };

export interface Placement {
  x: number;
  y: number;
}

export type Layout = Record<string, Placement>;

/**
 * Where every visible note sits, in world coordinates.
 *
 * Only roots carry stored coordinates. A docked note's position is derived from its parent, its
 * side, and its index within that side — so moving a parent moves its whole cluster for free, and
 * there is no per-note position to keep in sync across clients.
 *
 * Stacks are centred on the parent, and docking is recursive: a note docked to a child docks to
 * that child, and the cluster grows outward.
 */
export function layoutBoard(state: BoardState): Layout {
  const out: Layout = {};
  const byParentSide = groupChildren(state);
  const visited = new Set<string>();

  for (const note of Object.values(state.notes)) {
    if (note.parentId === null) place(note.id, note.x, note.y);
  }
  return out;

  function place(id: string, x: number, y: number): void {
    // Corrupt persisted state could in principle contain a cycle; refuse to loop on it.
    if (visited.has(id)) return;
    visited.add(id);
    out[id] = { x, y };

    if (state.notes[id]?.collapsed) return;

    const step = NOTE_SIZE + NOTE_GAP;
    for (const side of SIDES) {
      const kids = byParentSide.get(`${id}|${side}`) ?? [];
      kids.forEach((kid, i) => {
        const offset = (i - (kids.length - 1) / 2) * step;
        switch (side) {
          case 'right':
            return place(kid, x + step, y + offset);
          case 'left':
            return place(kid, x - step, y + offset);
          case 'top':
            return place(kid, x + offset, y - step);
          case 'bottom':
            return place(kid, x + offset, y + step);
        }
      });
    }
  }
}

function groupChildren(state: BoardState): Map<string, string[]> {
  const groups = new Map<string, { id: string; order: number }[]>();
  for (const note of Object.values(state.notes)) {
    if (!note.parentId || !note.side) continue;
    const key = `${note.parentId}|${note.side}`;
    const list = groups.get(key) ?? [];
    list.push({ id: note.id, order: note.order });
    groups.set(key, list);
  }
  const sorted = new Map<string, string[]>();
  for (const [key, list] of groups) {
    sorted.set(
      key,
      list.sort((a, b) => a.order - b.order).map((n) => n.id),
    );
  }
  return sorted;
}

/** Which edge of a square the point is nearest, by comparing normalised offsets from its centre. */
export function sideForPoint(place: Placement, px: number, py: number): Side {
  const dx = px - (place.x + NOTE_SIZE / 2);
  const dy = py - (place.y + NOTE_SIZE / 2);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

/** True when (px, py) falls inside the square at `place`. */
export function hitTest(place: Placement, px: number, py: number): boolean {
  return (
    px >= place.x && px <= place.x + NOTE_SIZE && py >= place.y && py <= place.y + NOTE_SIZE
  );
}

/** Left/right stacks run vertically; top/bottom stacks run horizontally. */
export function stackAxis(side: Side): 'x' | 'y' {
  return side === 'left' || side === 'right' ? 'y' : 'x';
}
