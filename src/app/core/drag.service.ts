import { Injectable, computed, inject, signal } from '@angular/core';
import { BoardStore } from './board.store';
import { NOTE_SIZE, hitTest, sideForPoint, stackAxis } from './layout';
import { Note, Side, subtreeIds } from './models/note.model';
import { UserService } from './user.service';
import { ViewportService } from './viewport.service';

/** Movement (in screen px) before a press becomes a drag rather than a click. */
const DRAG_THRESHOLD = 4;

/**
 * Where the note would land if released now.
 * `parentId: null` means loose on the board; otherwise it docks to `side` at `index` in that stack.
 */
export interface DropTarget {
  parentId: string | null;
  side: Side | null;
  index: number;
  valid: boolean;
}

export interface DragState {
  /** 'move' drags an existing note; 'create' drags a new one out of the palette. */
  kind: 'move' | 'create';
  noteId: string | null;
  typeId: string;
  /** Where the note's top-left currently sits, in world coords. */
  worldX: number;
  worldY: number;
  target: DropTarget | null;
}

interface PendingDrag {
  kind: 'move' | 'create';
  noteId: string | null;
  typeId: string;
  startX: number;
  startY: number;
  /** Grab offset inside the square, in world px. */
  offsetX: number;
  offsetY: number;
}

/**
 * Pointer drag with edge docking.
 *
 * Because every note's position is derived from the layout, drop resolution is pure geometry
 * against `store.layout()` — no DOM measuring, so it is unaffected by pan, zoom, or reflow. The
 * dragged note and its whole cluster are rendered at a live offset by the board.
 */
@Injectable({ providedIn: 'root' })
export class DragService {
  private readonly store = inject(BoardStore);
  private readonly viewport = inject(ViewportService);
  private readonly users = inject(UserService);

  private readonly _drag = signal<DragState | null>(null);
  readonly drag = this._drag.asReadonly();

  /** Ids moving with the cursor: the dragged note plus everything docked beneath it. */
  readonly draggingIds = computed(() => {
    const d = this._drag();
    if (!d?.noteId) return new Set<string>();
    return new Set(subtreeIds({ notes: this.store.notes() }, d.noteId));
  });

  private pending: PendingDrag | null = null;
  private moveHandler: ((e: PointerEvent) => void) | null = null;
  private upHandler: ((e: PointerEvent) => void) | null = null;

  /** Live world offset to apply to the dragged cluster, or null when nothing is being dragged. */
  readonly dragDelta = computed(() => {
    const d = this._drag();
    if (!d?.noteId) return null;
    const home = this.store.layout()[d.noteId];
    if (!home) return null;
    return { dx: d.worldX - home.x, dy: d.worldY - home.y };
  });

  activeSideFor(noteId: string): Side | null {
    const target = this._drag()?.target;
    if (!target?.valid || target.parentId !== noteId) return null;
    return target.side;
  }

  beginMove(event: PointerEvent, note: Note): void {
    const place = this.store.layout()[note.id];
    if (!place) return;
    const world = this.viewport.screenToWorld(event.clientX, event.clientY);
    this.begin(event, {
      kind: 'move',
      noteId: note.id,
      typeId: note.typeId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: world.x - place.x,
      offsetY: world.y - place.y,
    });
  }

  beginCreate(event: PointerEvent, typeId: string): void {
    this.begin(event, {
      kind: 'create',
      noteId: null,
      typeId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: NOTE_SIZE / 2,
      offsetY: NOTE_SIZE / 2,
    });
  }

  private begin(event: PointerEvent, pending: PendingDrag): void {
    this.cancel();
    this.pending = pending;
    event.preventDefault();

    this.moveHandler = (e) => this.onMove(e);
    this.upHandler = () => this.onUp();
    window.addEventListener('pointermove', this.moveHandler);
    window.addEventListener('pointerup', this.upHandler);
    window.addEventListener('pointercancel', this.upHandler);
  }

  private onMove(event: PointerEvent): void {
    const pending = this.pending;
    if (pending && !this._drag()) {
      if (Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY) < DRAG_THRESHOLD) {
        return;
      }
      this._drag.set({
        kind: pending.kind,
        noteId: pending.noteId,
        typeId: pending.typeId,
        worldX: 0,
        worldY: 0,
        target: null,
      });
    }

    const drag = this._drag();
    if (!drag || !this.pending) return;

    const world = this.viewport.screenToWorld(event.clientX, event.clientY);
    const worldX = world.x - this.pending.offsetX;
    const worldY = world.y - this.pending.offsetY;
    this._drag.set({ ...drag, worldX, worldY, target: this.resolveTarget(world.x, world.y, drag) });
  }

  private onUp(): void {
    const drag = this._drag();
    const pending = this.pending;
    this.teardown();
    if (!drag) return;

    const target = drag.target;
    const { worldX, worldY } = drag;
    this._drag.set(null);
    if (!target?.valid || !pending) return;

    if (drag.kind === 'create') {
      this.store.createNote(drag.typeId, {
        parentId: target.parentId,
        side: target.side,
        index: target.index,
        x: worldX,
        y: worldY,
        createdBy: this.users.current().id,
      });
      return;
    }

    const note = this.store.get(drag.noteId!);
    if (!note) return;
    if (target.parentId === null && note.parentId === null) {
      this.store.moveRoot(note.id, worldX, worldY);
    } else {
      this.store.reparent(note.id, target.parentId, target.side, target.index, {
        x: worldX,
        y: worldY,
      });
    }
  }

  cancel(): void {
    this.teardown();
    this._drag.set(null);
  }

  private teardown(): void {
    this.pending = null;
    if (this.moveHandler) window.removeEventListener('pointermove', this.moveHandler);
    if (this.upHandler) {
      window.removeEventListener('pointerup', this.upHandler);
      window.removeEventListener('pointercancel', this.upHandler);
    }
    this.moveHandler = null;
    this.upHandler = null;
  }

  // --- Drop resolution ------------------------------------------------------

  private resolveTarget(px: number, py: number, drag: DragState): DropTarget {
    const moving = drag.noteId ?? undefined;
    const loose = (valid: boolean): DropTarget => ({
      parentId: null,
      side: null,
      index: 0,
      valid,
    });

    const candidate = this.noteUnder(px, py);
    if (!candidate) return loose(this.store.canDrop(drag.typeId, null, moving));

    // 1. Dock to the edge of the square the pointer is over.
    if (this.store.canDrop(drag.typeId, candidate.id, moving)) {
      const side = sideForPoint(this.store.layout()[candidate.id], px, py);
      return {
        parentId: candidate.id,
        side,
        index: this.indexInStack(candidate.id, side, px, py, moving),
        valid: true,
      };
    }

    // 2. Over a square that can't take it, but whose own parent can — join that stack instead.
    //    This is how you reorder a stack: aim at the neighbour you want to sit next to.
    const host = candidate.parentId;
    if (host && candidate.side && this.store.canDrop(drag.typeId, host, moving)) {
      return {
        parentId: host,
        side: candidate.side,
        index: this.indexInStack(host, candidate.side, px, py, moving),
        valid: true,
      };
    }

    // 3. Root-capable notes simply float over whatever is beneath them.
    if (this.store.canDrop(drag.typeId, null, moving)) return loose(true);

    // 4. Nothing here accepts it — flag the square being hovered so the reason can be shown.
    return { parentId: candidate.id, side: null, index: 0, valid: false };
  }

  /** Topmost placed note containing the point, ignoring the cluster being dragged. */
  private noteUnder(px: number, py: number): Note | null {
    const layout = this.store.layout();
    const moving = this.draggingIds();
    let found: Note | null = null;
    for (const note of Object.values(this.store.notes())) {
      if (moving.has(note.id)) continue;
      const place = layout[note.id];
      if (place && hitTest(place, px, py)) found = note;
    }
    return found;
  }

  /** Position in a side's stack, by comparing the pointer to each existing square's centre. */
  private indexInStack(
    parentId: string,
    side: Side,
    px: number,
    py: number,
    excludeId?: string,
  ): number {
    const layout = this.store.layout();
    const axis = stackAxis(side);
    const pointer = axis === 'y' ? py : px;
    const siblings = this.store
      .childrenOf(parentId, side)
      .filter((n) => n.id !== excludeId && layout[n.id]);

    let index = 0;
    for (const sibling of siblings) {
      const place = layout[sibling.id];
      const centre = (axis === 'y' ? place.y : place.x) + NOTE_SIZE / 2;
      if (pointer > centre) index++;
      else break;
    }
    return index;
  }
}
