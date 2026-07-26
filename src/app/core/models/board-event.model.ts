import { Note } from './note.model';

/**
 * Every mutation to the board is one of these. They are the wire format for the sync layer, so
 * they must stay serializable and self-contained (no object references into current state).
 */
export type BoardEvent =
  | { t: 'create'; note: Note }
  | { t: 'text'; id: string; text: string }
  | { t: 'move'; id: string; x: number; y: number }
  | { t: 'reparent'; id: string; parentId: string | null; order: number; x?: number; y?: number }
  | { t: 'vote'; id: string; userId: string; on: boolean }
  | { t: 'collapse'; id: string; collapsed: boolean }
  | { t: 'delete'; id: string };
