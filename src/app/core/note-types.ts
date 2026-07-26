/**
 * The attachment rules for the board, as pure config.
 *
 * This file is the piece most directly reusable in the real project: swapping in a different set of
 * types and rules changes the whole semantics of the board without touching a component.
 */
export interface NoteType {
  id: string;
  label: string;
  /** Sticky body colour. */
  color: string;
  /** Header / chip colour, also used for drop-target highlight. */
  accent: string;
  /** Text colour that reads on `color`. */
  ink: string;
  /** May this note live directly on the board? */
  canBeRoot: boolean;
  /** typeIds this note may be nested inside. */
  allowedParents: string[];
  placeholder: string;
}

export const NOTE_TYPES: Record<string, NoteType> = {
  theme: {
    id: 'theme',
    label: 'Theme',
    color: '#fde68a',
    accent: '#d97706',
    ink: '#4a3407',
    canBeRoot: true,
    allowedParents: [],
    placeholder: 'What are we brainstorming?',
  },
  idea: {
    id: 'idea',
    label: 'Idea',
    color: '#bfdbfe',
    accent: '#2563eb',
    ink: '#12325e',
    canBeRoot: false,
    allowedParents: ['theme'],
    placeholder: 'An idea for this theme…',
  },
  action: {
    id: 'action',
    label: 'Action',
    color: '#bbf7d0',
    accent: '#16a34a',
    ink: '#0f3f22',
    canBeRoot: false,
    allowedParents: ['idea'],
    placeholder: 'Something we would do…',
  },
  question: {
    id: 'question',
    label: 'Question',
    color: '#fbcfe8',
    accent: '#db2777',
    ink: '#5a1136',
    canBeRoot: false,
    allowedParents: ['idea'],
    placeholder: 'What do we need to find out?',
  },
};

export const NOTE_TYPE_LIST: NoteType[] = Object.values(NOTE_TYPES);

export function noteType(typeId: string): NoteType {
  const type = NOTE_TYPES[typeId];
  if (!type) throw new Error(`Unknown note type: ${typeId}`);
  return type;
}

/**
 * May a note of `childTypeId` be attached to a parent of `parentTypeId`?
 * `null` parent means "dropped on the board itself".
 */
export function canAttach(childTypeId: string, parentTypeId: string | null): boolean {
  const child = NOTE_TYPES[childTypeId];
  if (!child) return false;
  if (parentTypeId === null) return child.canBeRoot;
  if (!NOTE_TYPES[parentTypeId]) return false;
  return child.allowedParents.includes(parentTypeId);
}

/** Types that may be nested inside the given type — used for the "drop X here" affordance. */
export function acceptedChildTypes(parentTypeId: string): NoteType[] {
  return NOTE_TYPE_LIST.filter((t) => t.allowedParents.includes(parentTypeId));
}
