import { Injectable, computed, signal } from '@angular/core';

export interface BoardUser {
  id: string;
  name: string;
  color: string;
}

/** Simulated participants. In the real project this comes from the auth/presence layer. */
export const BOARD_USERS: BoardUser[] = [
  { id: 'u-ada', name: 'Ada', color: '#ef4444' },
  { id: 'u-grace', name: 'Grace', color: '#8b5cf6' },
  { id: 'u-alan', name: 'Alan', color: '#0ea5e9' },
  { id: 'u-linus', name: 'Linus', color: '#f59e0b' },
];

const STORAGE_KEY = 'floating-notes:user';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly currentId = signal<string>(
    localStorage.getItem(STORAGE_KEY) ?? BOARD_USERS[0].id,
  );

  readonly users = BOARD_USERS;
  readonly current = computed(
    () => BOARD_USERS.find((u) => u.id === this.currentId()) ?? BOARD_USERS[0],
  );

  setCurrent(id: string): void {
    this.currentId.set(id);
    localStorage.setItem(STORAGE_KEY, id);
  }

  byId(id: string): BoardUser {
    return BOARD_USERS.find((u) => u.id === id) ?? { id, name: id, color: '#94a3b8' };
  }
}
