import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BoardStore, applyEvent } from './board.store';
import { BoardState, Note, Side } from './models/note.model';
import { LocalSyncAdapter } from './sync/local-sync.adapter';
import { SYNC_ADAPTER } from './sync/sync-adapter';

function note(
  id: string,
  typeId: string,
  parentId: string | null,
  side: Side | null = parentId ? 'right' : null,
  order = 1000,
): Note {
  return {
    id,
    typeId,
    parentId,
    side,
    text: '',
    x: 0,
    y: 0,
    order,
    votes: [],
    createdBy: 'u-ada',
    collapsed: false,
    updatedAt: 0,
  };
}

function state(...notes: Note[]): BoardState {
  return { notes: Object.fromEntries(notes.map((n) => [n.id, n])) };
}

describe('applyEvent', () => {
  it('deletes a note together with its whole subtree', () => {
    const before = state(
      note('t', 'theme', null),
      note('i', 'idea', 't'),
      note('a', 'action', 'i'),
      note('other', 'theme', null),
    );
    const after = applyEvent(before, { t: 'delete', id: 't' });
    expect(Object.keys(after.notes)).toEqual(['other']);
  });

  it('is a no-op for a vote that is already in the requested state', () => {
    const before = state(note('n', 'theme', null));
    const same = applyEvent(before, { t: 'vote', id: 'n', userId: 'u-ada', on: false });
    expect(same).toBe(before);
  });

  it('adds and removes a single vote per user', () => {
    let s = state(note('n', 'theme', null));
    s = applyEvent(s, { t: 'vote', id: 'n', userId: 'u-ada', on: true });
    s = applyEvent(s, { t: 'vote', id: 'n', userId: 'u-ada', on: true });
    expect(s.notes['n'].votes).toEqual(['u-ada']);
    s = applyEvent(s, { t: 'vote', id: 'n', userId: 'u-ada', on: false });
    expect(s.notes['n'].votes).toEqual([]);
  });

  it('ignores events for notes that no longer exist', () => {
    const before = state(note('n', 'theme', null));
    expect(applyEvent(before, { t: 'text', id: 'gone', text: 'x' })).toBe(before);
  });
});

describe('BoardStore', () => {
  let store: BoardStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: SYNC_ADAPTER, useExisting: LocalSyncAdapter },
      ],
    });
    store = TestBed.inject(BoardStore);
    // Start from a known board rather than the seed.
    for (const id of Object.keys(store.notes())) store.remove(id);
    store.dispatch({ t: 'create', note: note('t', 'theme', null) });
    store.dispatch({ t: 'create', note: note('i', 'idea', 't') });
    store.dispatch({ t: 'create', note: note('a', 'action', 'i') });
  });

  afterEach(() => localStorage.clear());

  it('refuses an attachment that breaks the type rules', () => {
    expect(store.reparent('a', 't', 'right', 0)).toBe(false);
    expect(store.get('a')!.parentId).toBe('i');
  });

  it('refuses to attach a note to itself or to its own descendant', () => {
    expect(store.reparent('t', 't', 'right', 0)).toBe(false);
    expect(store.reparent('t', 'i', 'right', 0)).toBe(false);
    expect(store.reparent('t', 'a', 'right', 0)).toBe(false);
    expect(store.get('t')!.parentId).toBeNull();
  });

  it('refuses to drop a non-root type loose on the board', () => {
    expect(store.reparent('i', null, null, 0, { x: 10, y: 10 })).toBe(false);
    expect(store.get('i')!.parentId).toBe('t');
  });

  it('accepts a legal move between two themes and records the side', () => {
    store.dispatch({ t: 'create', note: note('t2', 'theme', null) });
    expect(store.reparent('i', 't2', 'bottom', 0)).toBe(true);
    expect(store.get('i')!.parentId).toBe('t2');
    expect(store.get('i')!.side).toBe('bottom');
    expect(store.childrenOf('t').length).toBe(0);
    expect(store.childrenOf('t2', 'bottom').map((n) => n.id)).toEqual(['i']);
  });

  it('keeps each side of a square as its own ordered stack', () => {
    store.dispatch({ t: 'create', note: note('i2', 'idea', 't', 'right', 2000) });
    store.dispatch({ t: 'create', note: note('i3', 'idea', 't', 'top', 3000) });

    expect(store.childrenOf('t', 'right').map((n) => n.id)).toEqual(['i', 'i2']);
    expect(store.childrenOf('t', 'top').map((n) => n.id)).toEqual(['i3']);
    expect(store.childrenOf('t').length).toBe(3);

    // Moving to index 0 of the right-hand stack puts it ahead of both existing notes.
    store.reparent('i3', 't', 'right', 0);
    expect(store.childrenOf('t', 'right').map((n) => n.id)).toEqual(['i3', 'i', 'i2']);
    expect(store.childrenOf('t', 'top').length).toBe(0);
  });

  it('lays out a moved note on its new side, carrying its own attachments', () => {
    const before = store.layout();
    expect(before['i'].x).toBeGreaterThan(before['t'].x);

    store.reparent('i', 't', 'left', 0);
    const after = store.layout();
    expect(after['i'].x).toBeLessThan(after['t'].x);
    // The action is docked to the idea's right, so it stays one step to the idea's right and
    // travels with it — which here happens to land it back over the theme. Docking is relative to
    // the parent only; it does not avoid collisions elsewhere in the cluster.
    expect(after['a'].x - after['i'].x).toBe(before['a'].x - before['i'].x);
    expect(after['a'].y).toBe(after['i'].y);
  });

  it('will not create a note that the rules disallow', () => {
    expect(store.createNote('action', { parentId: 't', createdBy: 'u-ada' })).toBeNull();
    expect(store.createNote('idea', { parentId: null, createdBy: 'u-ada' })).toBeNull();
    expect(store.createNote('idea', { parentId: 't', side: 'top', createdBy: 'u-ada' })).not.toBeNull();
    expect(store.childrenOf('t', 'top').length).toBe(1);
  });
});
