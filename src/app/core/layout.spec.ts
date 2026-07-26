import { NOTE_GAP, NOTE_SIZE, layoutBoard, sideForPoint } from './layout';
import { BoardState, Note, Side } from './models/note.model';

const STEP = NOTE_SIZE + NOTE_GAP;

function note(
  id: string,
  parentId: string | null,
  side: Side | null,
  order = 1000,
  extra: Partial<Note> = {},
): Note {
  return {
    id,
    typeId: 'theme',
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
    ...extra,
  };
}

function state(...notes: Note[]): BoardState {
  return { notes: Object.fromEntries(notes.map((n) => [n.id, n])) };
}

describe('layoutBoard', () => {
  it('places a root at its stored coordinates', () => {
    const layout = layoutBoard(state(note('r', null, null, 1000, { x: 40, y: 90 })));
    expect(layout['r']).toEqual({ x: 40, y: 90 });
  });

  it('docks a single child flush to the chosen side, centred on the parent', () => {
    const base = note('r', null, null, 1000, { x: 0, y: 0 });
    expect(layoutBoard(state(base, note('c', 'r', 'right')))['c']).toEqual({ x: STEP, y: 0 });
    expect(layoutBoard(state(base, note('c', 'r', 'left')))['c']).toEqual({ x: -STEP, y: 0 });
    expect(layoutBoard(state(base, note('c', 'r', 'top')))['c']).toEqual({ x: 0, y: -STEP });
    expect(layoutBoard(state(base, note('c', 'r', 'bottom')))['c']).toEqual({ x: 0, y: STEP });
  });

  it('centres a stack of children on the parent and orders it by `order`', () => {
    const layout = layoutBoard(
      state(
        note('r', null, null, 1000, { x: 0, y: 0 }),
        note('b', 'r', 'right', 2000),
        note('a', 'r', 'right', 1000),
      ),
    );
    expect(layout['a']).toEqual({ x: STEP, y: -STEP / 2 });
    expect(layout['b']).toEqual({ x: STEP, y: STEP / 2 });
  });

  it('keeps each side an independent stack', () => {
    const layout = layoutBoard(
      state(
        note('r', null, null, 1000, { x: 0, y: 0 }),
        note('right', 'r', 'right'),
        note('bottom', 'r', 'bottom'),
      ),
    );
    expect(layout['right']).toEqual({ x: STEP, y: 0 });
    expect(layout['bottom']).toEqual({ x: 0, y: STEP });
  });

  it('docks grandchildren to their own parent, growing the cluster outward', () => {
    const layout = layoutBoard(
      state(
        note('r', null, null, 1000, { x: 0, y: 0 }),
        note('c', 'r', 'right'),
        note('g', 'c', 'bottom'),
      ),
    );
    expect(layout['c']).toEqual({ x: STEP, y: 0 });
    expect(layout['g']).toEqual({ x: STEP, y: STEP });
  });

  it('omits the subtree of a collapsed note', () => {
    const layout = layoutBoard(
      state(
        note('r', null, null, 1000, { x: 0, y: 0, collapsed: true }),
        note('c', 'r', 'right'),
        note('g', 'c', 'right'),
      ),
    );
    expect(layout['r']).toBeDefined();
    expect(layout['c']).toBeUndefined();
    expect(layout['g']).toBeUndefined();
  });

  it('does not loop forever on a cycle in corrupt state', () => {
    const layout = layoutBoard(state(note('a', 'b', 'right'), note('b', 'a', 'right')));
    expect(layout).toEqual({});
  });
});

describe('sideForPoint', () => {
  const place = { x: 0, y: 0 };
  const mid = NOTE_SIZE / 2;

  it('picks the edge the point leans towards', () => {
    expect(sideForPoint(place, NOTE_SIZE - 5, mid)).toBe('right');
    expect(sideForPoint(place, 5, mid)).toBe('left');
    expect(sideForPoint(place, mid, 5)).toBe('top');
    expect(sideForPoint(place, mid, NOTE_SIZE - 5)).toBe('bottom');
  });
});
