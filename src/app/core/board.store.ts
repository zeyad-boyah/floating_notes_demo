import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { BoardEvent } from './models/board-event.model';
import { BoardState, EMPTY_BOARD, Note, isDescendantOf, subtreeIds } from './models/note.model';
import { canAttach } from './note-types';
import { seedBoard } from './sync/seed-board';
import { SYNC_ADAPTER } from './sync/sync-adapter';

const ROOT_KEY = '__root__';

/**
 * Pure reducer — the single place board state changes.
 *
 * Both locally-dispatched events and events arriving from the sync adapter go through it, which is
 * what lets a real multi-user backend drop in without touching anything else.
 */
export function applyEvent(state: BoardState, event: BoardEvent): BoardState {
  switch (event.t) {
    case 'create':
      return { notes: { ...state.notes, [event.note.id]: event.note } };

    case 'text':
      return patch(state, event.id, { text: event.text });

    case 'move':
      return patch(state, event.id, { x: event.x, y: event.y });

    case 'reparent': {
      const note = state.notes[event.id];
      if (!note) return state;
      return patch(state, event.id, {
        parentId: event.parentId,
        order: event.order,
        x: event.x ?? note.x,
        y: event.y ?? note.y,
      });
    }

    case 'vote': {
      const note = state.notes[event.id];
      if (!note) return state;
      const has = note.votes.includes(event.userId);
      if (has === event.on) return state;
      const votes = event.on
        ? [...note.votes, event.userId]
        : note.votes.filter((u) => u !== event.userId);
      return patch(state, event.id, { votes });
    }

    case 'collapse':
      return patch(state, event.id, { collapsed: event.collapsed });

    case 'delete': {
      if (!state.notes[event.id]) return state;
      const doomed = new Set(subtreeIds(state, event.id));
      const notes: Record<string, Note> = {};
      for (const [id, note] of Object.entries(state.notes)) {
        if (!doomed.has(id)) notes[id] = note;
      }
      return { notes };
    }
  }
}

function patch(state: BoardState, id: string, changes: Partial<Note>): BoardState {
  const note = state.notes[id];
  if (!note) return state;
  return { notes: { ...state.notes, [id]: { ...note, ...changes, updatedAt: Date.now() } } };
}

@Injectable({ providedIn: 'root' })
export class BoardStore {
  private readonly sync = inject(SYNC_ADAPTER);
  private readonly state = signal<BoardState>(this.sync.snapshot() ?? EMPTY_BOARD);

  constructor() {
    const sub = this.sync.remote$.subscribe((event) => this.applyRemote(event));
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  /** Children grouped by parentId (roots under ROOT_KEY), each list sorted by `order`. */
  private readonly grouped = computed(() => {
    const groups: Record<string, Note[]> = {};
    for (const note of Object.values(this.state().notes)) {
      const key = note.parentId ?? ROOT_KEY;
      (groups[key] ??= []).push(note);
    }
    for (const list of Object.values(groups)) list.sort((a, b) => a.order - b.order);
    return groups;
  });

  readonly notes = computed(() => this.state().notes);
  readonly roots = computed(() => this.grouped()[ROOT_KEY] ?? []);
  readonly count = computed(() => Object.keys(this.state().notes).length);

  childrenOf(id: string): Note[] {
    return this.grouped()[id] ?? [];
  }

  get(id: string): Note | undefined {
    return this.state().notes[id];
  }

  /** Apply locally, then broadcast. Remote events use `applyRemote` and skip the broadcast. */
  dispatch(event: BoardEvent): void {
    const next = applyEvent(this.state(), event);
    if (next === this.state()) return;
    this.state.set(next);
    this.sync.publish(event, next);
  }

  applyRemote(event: BoardEvent): void {
    this.state.set(applyEvent(this.state(), event));
  }

  // --- Intent helpers -------------------------------------------------------
  // Validation lives here rather than in components, so every caller (drag, palette, keyboard)
  // gets the same rules.

  /** True if `childTypeId` may be dropped into `parentId` (null = the board). */
  canDrop(childTypeId: string, parentId: string | null, movingNoteId?: string): boolean {
    if (parentId === null) return canAttach(childTypeId, null);
    const parent = this.get(parentId);
    if (!parent) return false;
    if (movingNoteId) {
      if (parentId === movingNoteId) return false;
      if (isDescendantOf(this.state(), parentId, movingNoteId)) return false;
    }
    return canAttach(childTypeId, parent.typeId);
  }

  /**
   * A sort key that places a note at `index` among the children of `parentId`.
   * Sparse gaps of 1000 mean inserts almost never have to renumber siblings.
   */
  orderForIndex(parentId: string | null, index: number, excludeId?: string): number {
    const siblings = (this.grouped()[parentId ?? ROOT_KEY] ?? []).filter(
      (n) => n.id !== excludeId,
    );
    const clamped = Math.max(0, Math.min(index, siblings.length));
    const before = siblings[clamped - 1]?.order;
    const after = siblings[clamped]?.order;
    if (before === undefined && after === undefined) return 1000;
    if (before === undefined) return after! - 1000;
    if (after === undefined) return before + 1000;
    return (before + after) / 2;
  }

  createNote(typeId: string, opts: {
    parentId: string | null;
    x?: number;
    y?: number;
    index?: number;
    createdBy: string;
  }): Note | null {
    if (!this.canDrop(typeId, opts.parentId)) return null;
    const note: Note = {
      id: `n-${Math.random().toString(36).slice(2, 10)}`,
      typeId,
      parentId: opts.parentId,
      text: '',
      x: opts.x ?? 0,
      y: opts.y ?? 0,
      order: this.orderForIndex(opts.parentId, opts.index ?? Number.MAX_SAFE_INTEGER),
      votes: [],
      createdBy: opts.createdBy,
      collapsed: false,
      updatedAt: Date.now(),
    };
    this.dispatch({ t: 'create', note });
    return note;
  }

  setText(id: string, text: string): void {
    if (this.get(id)?.text === text) return;
    this.dispatch({ t: 'text', id, text });
  }

  moveRoot(id: string, x: number, y: number): void {
    this.dispatch({ t: 'move', id, x, y });
  }

  /** Returns false (and changes nothing) when the type rules or cycle guard reject the drop. */
  reparent(id: string, parentId: string | null, index: number, world?: { x: number; y: number }): boolean {
    const note = this.get(id);
    if (!note) return false;
    if (!this.canDrop(note.typeId, parentId, id)) return false;
    this.dispatch({
      t: 'reparent',
      id,
      parentId,
      order: this.orderForIndex(parentId, index, id),
      ...(parentId === null && world ? { x: world.x, y: world.y } : {}),
    });
    return true;
  }

  toggleVote(id: string, userId: string): void {
    const note = this.get(id);
    if (!note) return;
    this.dispatch({ t: 'vote', id, userId, on: !note.votes.includes(userId) });
  }

  setCollapsed(id: string, collapsed: boolean): void {
    this.dispatch({ t: 'collapse', id, collapsed });
  }

  remove(id: string): void {
    this.dispatch({ t: 'delete', id });
  }

  resetToSeed(): void {
    this.state.set(this.sync.reset?.() ?? seedBoard());
  }
}
