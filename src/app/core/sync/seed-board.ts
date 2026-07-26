import { BoardState, Note } from '../models/note.model';

function note(partial: Partial<Note> & Pick<Note, 'id' | 'typeId' | 'text'>): Note {
  return {
    parentId: null,
    x: 0,
    y: 0,
    order: 0,
    votes: [],
    createdBy: 'u-ada',
    collapsed: false,
    updatedAt: 0,
    ...partial,
  };
}

/** First-run board, so the demo has something to poke at immediately. */
export function seedBoard(): BoardState {
  const notes: Note[] = [
    note({ id: 'n1', typeId: 'theme', text: 'Onboarding feels slow', x: 120, y: 120 }),
    note({
      id: 'n2',
      typeId: 'idea',
      text: 'Skip the tour for returning users',
      parentId: 'n1',
      order: 1000,
      votes: ['u-ada', 'u-grace'],
    }),
    note({
      id: 'n3',
      typeId: 'action',
      text: 'Measure how many people finish the tour',
      parentId: 'n2',
      order: 1000,
      createdBy: 'u-grace',
    }),
    note({
      id: 'n4',
      typeId: 'idea',
      text: 'Ask for the workspace name later',
      parentId: 'n1',
      order: 2000,
      createdBy: 'u-alan',
      votes: ['u-alan'],
    }),
    note({ id: 'n5', typeId: 'theme', text: 'Pricing page confusion', x: 620, y: 180 }),
    note({
      id: 'n6',
      typeId: 'idea',
      text: 'Show a single recommended plan',
      parentId: 'n5',
      order: 1000,
      createdBy: 'u-linus',
    }),
    note({
      id: 'n7',
      typeId: 'question',
      text: 'Do people compare us to anyone specific?',
      parentId: 'n6',
      order: 1000,
      createdBy: 'u-grace',
    }),
  ];

  return { notes: Object.fromEntries(notes.map((n) => [n.id, n])) };
}
