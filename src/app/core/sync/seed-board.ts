import { BoardState, Note } from '../models/note.model';

function note(partial: Partial<Note> & Pick<Note, 'id' | 'typeId' | 'text'>): Note {
  return {
    parentId: null,
    side: null,
    x: 0,
    y: 0,
    order: 1000,
    votes: [],
    createdBy: 'u-ada',
    collapsed: false,
    updatedAt: 0,
    ...partial,
  };
}

/** First-run board: two themes with notes docked on different sides, so the shape is obvious. */
export function seedBoard(): BoardState {
  const notes: Note[] = [
    note({ id: 'n1', typeId: 'theme', text: 'Onboarding feels slow', x: 340, y: 320 }),
    note({
      id: 'n2',
      typeId: 'idea',
      text: 'Skip the tour for returning users',
      parentId: 'n1',
      side: 'right',
      order: 1000,
      votes: ['u-ada', 'u-grace'],
    }),
    note({
      id: 'n3',
      typeId: 'action',
      text: 'Measure how many people finish the tour',
      parentId: 'n2',
      side: 'top',
      createdBy: 'u-grace',
    }),
    note({
      id: 'n4',
      typeId: 'idea',
      text: 'Ask for the workspace name later',
      parentId: 'n1',
      side: 'right',
      order: 2000,
      createdBy: 'u-alan',
      votes: ['u-alan'],
    }),
    note({
      id: 'n5',
      typeId: 'idea',
      text: 'Let people invite the team afterwards',
      parentId: 'n1',
      side: 'bottom',
      createdBy: 'u-linus',
    }),
    note({ id: 'n6', typeId: 'theme', text: 'Pricing page confusion', x: 900, y: 620 }),
    note({
      id: 'n7',
      typeId: 'idea',
      text: 'Show a single recommended plan',
      parentId: 'n6',
      side: 'left',
      createdBy: 'u-linus',
    }),
    note({
      id: 'n8',
      typeId: 'question',
      text: 'Do people compare us to anyone specific?',
      parentId: 'n7',
      side: 'bottom',
      createdBy: 'u-grace',
      votes: ['u-grace'],
    }),
  ];

  return { notes: Object.fromEntries(notes.map((n) => [n.id, n])) };
}
