import { Injectable, inject, signal } from '@angular/core';
import { BoardStore } from './board.store';
import { Note } from './models/note.model';
import { UserService } from './user.service';
import { ViewportService } from './viewport.service';

/** Movement (in screen px) before a press becomes a drag rather than a click. */
const DRAG_THRESHOLD = 4;
const DEFAULT_GHOST_WIDTH = 240;

/**
 * Where the note would land if released now.
 * `parentId: null` means the board itself; `index` is the position among that parent's children.
 */
export interface DropTarget {
  parentId: string | null;
  index: number;
  valid: boolean;
}

export interface DragState {
  /** 'move' drags an existing note; 'create' drags a new one out of the palette. */
  kind: 'move' | 'create';
  noteId: string | null;
  typeId: string;
  /** Ghost top-left, in screen coords. */
  screenX: number;
  screenY: number;
  /** Ghost size in world px (the ghost is rendered at the current zoom). */
  width: number;
  /** Grab offset inside the card, in world px. */
  offsetX: number;
  offsetY: number;
  target: DropTarget | null;
}

interface PendingDrag {
  kind: 'move' | 'create';
  noteId: string | null;
  typeId: string;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  width: number;
}

/**
 * Pointer-driven drag with containment drops.
 *
 * Drop targets are resolved by hit-testing the DOM (`elementsFromPoint`) rather than by caching
 * rectangles: nesting reflows the layout on every hover and the board pans and zooms underneath, so
 * cached geometry would be stale constantly. The DOM contract is two data attributes:
 *   [data-note-id]      on each card
 *   [data-children-of]  on the container holding that card's children
 */
@Injectable({ providedIn: 'root' })
export class DragService {
  private readonly store = inject(BoardStore);
  private readonly viewport = inject(ViewportService);
  private readonly users = inject(UserService);

  private readonly _drag = signal<DragState | null>(null);
  readonly drag = this._drag.asReadonly();

  private pending: PendingDrag | null = null;
  private moveHandler: ((e: PointerEvent) => void) | null = null;
  private upHandler: ((e: PointerEvent) => void) | null = null;

  isDragging(noteId: string): boolean {
    const d = this._drag();
    return d?.kind === 'move' && d.noteId === noteId;
  }

  /** The card currently highlighted as the drop parent, or null for the board. */
  activeTarget(): DropTarget | null {
    return this._drag()?.target ?? null;
  }

  /** Start dragging an existing note. `el` is its rendered card. */
  beginMove(event: PointerEvent, note: Note, el: HTMLElement): void {
    const rect = el.getBoundingClientRect();
    const scale = this.viewport.scale();
    this.begin(event, {
      kind: 'move',
      noteId: note.id,
      typeId: note.typeId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: (event.clientX - rect.left) / scale,
      offsetY: (event.clientY - rect.top) / scale,
      width: rect.width / scale,
    });
  }

  /** Start dragging a brand-new note out of the palette. */
  beginCreate(event: PointerEvent, typeId: string): void {
    this.begin(event, {
      kind: 'create',
      noteId: null,
      typeId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: DEFAULT_GHOST_WIDTH / 2,
      offsetY: 24,
      width: DEFAULT_GHOST_WIDTH,
    });
  }

  private begin(event: PointerEvent, pending: PendingDrag): void {
    this.cancel();
    this.pending = pending;
    event.preventDefault();

    this.moveHandler = (e) => this.onMove(e);
    this.upHandler = (e) => this.onUp(e);
    window.addEventListener('pointermove', this.moveHandler);
    window.addEventListener('pointerup', this.upHandler);
    window.addEventListener('pointercancel', this.upHandler);
  }

  private onMove(event: PointerEvent): void {
    const pending = this.pending;
    if (pending && !this._drag()) {
      const dx = event.clientX - pending.startX;
      const dy = event.clientY - pending.startY;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      this._drag.set({
        kind: pending.kind,
        noteId: pending.noteId,
        typeId: pending.typeId,
        screenX: 0,
        screenY: 0,
        width: pending.width,
        offsetX: pending.offsetX,
        offsetY: pending.offsetY,
        target: null,
      });
    }

    const drag = this._drag();
    if (!drag) return;

    const scale = this.viewport.scale();
    const target = this.resolveTarget(event.clientX, event.clientY, drag);
    this._drag.set({
      ...drag,
      screenX: event.clientX - drag.offsetX * scale,
      screenY: event.clientY - drag.offsetY * scale,
      target,
    });
  }

  private onUp(event: PointerEvent): void {
    const drag = this._drag();
    this.teardown();
    if (!drag) return;

    const target = drag.target;
    this._drag.set(null);
    if (!target?.valid) return;

    // Top-left of the ghost, in world coords — where a root note should land.
    const world = this.viewport.screenToWorld(
      event.clientX - drag.offsetX * this.viewport.scale(),
      event.clientY - drag.offsetY * this.viewport.scale(),
    );

    if (drag.kind === 'create') {
      this.store.createNote(drag.typeId, {
        parentId: target.parentId,
        x: world.x,
        y: world.y,
        index: target.index,
        createdBy: this.users.current().id,
      });
      return;
    }

    const note = this.store.get(drag.noteId!);
    if (!note) return;
    if (target.parentId === null && note.parentId === null) {
      this.store.moveRoot(note.id, world.x, world.y);
    } else {
      this.store.reparent(note.id, target.parentId, target.index, world);
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

  // --- Hit testing ----------------------------------------------------------

  private resolveTarget(sx: number, sy: number, drag: DragState): DropTarget {
    const moving = drag.noteId ?? undefined;
    const rootTarget = (valid: boolean): DropTarget => ({ parentId: null, index: 0, valid });

    const card = this.cardUnder(sx, sy, drag.noteId);
    // Root drops are absolutely positioned, so sibling order carries no meaning there.
    if (!card) return rootTarget(this.store.canDrop(drag.typeId, null, moving));

    const cardId = card.dataset['noteId']!;

    // 1. Nest inside the card the pointer is actually over.
    if (this.store.canDrop(drag.typeId, cardId, moving)) {
      return { parentId: cardId, index: this.insertionIndex(cardId, sy, drag.noteId), valid: true };
    }

    // 2. Near a card's top or bottom edge, aim at its container instead. Without this, siblings
    //    completely mask their own parent and reordering within a parent is unreachable.
    const container = card.parentElement?.closest<HTMLElement>('[data-children-of]');
    const siblingParent = container?.dataset['childrenOf'];
    if (siblingParent && this.store.canDrop(drag.typeId, siblingParent, moving)) {
      const rect = card.getBoundingClientRect();
      const band = Math.min(rect.height * 0.3, 22);
      if (sy < rect.top + band || sy > rect.bottom - band) {
        return {
          parentId: siblingParent,
          index: this.insertionIndex(siblingParent, sy, drag.noteId),
          valid: true,
        };
      }
    }

    // 3. Root-capable notes simply float over whatever happens to be beneath them.
    if (this.store.canDrop(drag.typeId, null, moving)) return rootTarget(true);

    // 4. Nothing here accepts it — flag the card being hovered so the reason can be shown.
    return { parentId: cardId, index: 0, valid: false };
  }

  /**
   * Innermost card under the pointer. The dragged card sets `pointer-events: none` while lifted, so
   * it never hit-tests against itself; we still guard on its id for safety.
   */
  private cardUnder(sx: number, sy: number, draggedId: string | null): HTMLElement | null {
    for (const el of document.elementsFromPoint(sx, sy)) {
      const card = (el as HTMLElement).closest?.('[data-note-id]') as HTMLElement | null;
      if (!card) continue;
      if (draggedId && (card.dataset['noteId'] === draggedId || card.closest(`[data-note-id="${draggedId}"]`))) {
        continue;
      }
      return card;
    }
    return null;
  }

  /** Which slot among the parent's children the pointer sits in, by Y midpoints. */
  private insertionIndex(parentId: string, sy: number, draggedId: string | null): number {
    const container = document.querySelector<HTMLElement>(`[data-children-of="${parentId}"]`);
    if (!container) return this.store.childrenOf(parentId).length;

    const siblings = Array.from(
      container.querySelectorAll<HTMLElement>(':scope > [data-note-id]'),
    ).filter((el) => el.dataset['noteId'] !== draggedId);

    let index = 0;
    for (const el of siblings) {
      const rect = el.getBoundingClientRect();
      if (sy > rect.top + rect.height / 2) index++;
      else break;
    }
    return index;
  }
}
