import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BoardStore, applyEvent } from './board.store';
import { BoardState, Note } from './models/note.model';
import { LocalSyncAdapter } from './sync/local-sync.adapter';
import { SYNC_ADAPTER } from './sync/sync-adapter';

function note(id: string, typeId: string, parentId: string | null, order = 1000): Note {
  return {
    id,
    typeId,
    parentId,
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

  it('refuses a reparent that breaks the type rules', () => {
    expect(store.reparent('a', 't', 0)).toBe(false);
    expect(store.get('a')!.parentId).toBe('i');
  });

  it('refuses to nest a note inside itself or its own descendant', () => {
    expect(store.reparent('t', 't', 0)).toBe(false);
    expect(store.reparent('t', 'i', 0)).toBe(false);
    expect(store.reparent('t', 'a', 0)).toBe(false);
    expect(store.get('t')!.parentId).toBeNull();
  });

  it('refuses to drop a non-root type onto the board', () => {
    expect(store.reparent('i', null, 0, { x: 10, y: 10 })).toBe(false);
    expect(store.get('i')!.parentId).toBe('t');
  });

  it('accepts a legal reparent between two themes', () => {
    store.dispatch({ t: 'create', note: note('t2', 'theme', null) });
    expect(store.reparent('i', 't2', 0)).toBe(true);
    expect(store.get('i')!.parentId).toBe('t2');
    expect(store.childrenOf('t').length).toBe(0);
    expect(store.childrenOf('t2').map((n) => n.id)).toEqual(['i']);
  });

  it('orders siblings by the index given to reparent', () => {
    store.dispatch({ t: 'create', note: note('i2', 'idea', 't', 2000) });
    store.dispatch({ t: 'create', note: note('i3', 'idea', 't', 3000) });
    store.reparent('i3', 't', 0);
    expect(store.childrenOf('t').map((n) => n.id)).toEqual(['i3', 'i', 'i2']);
  });

  it('will not create a note that the rules disallow', () => {
    expect(store.createNote('action', { parentId: 't', createdBy: 'u-ada' })).toBeNull();
    expect(store.createNote('idea', { parentId: null, createdBy: 'u-ada' })).toBeNull();
    expect(store.createNote('idea', { parentId: 't', createdBy: 'u-ada' })).not.toBeNull();
  });
});
