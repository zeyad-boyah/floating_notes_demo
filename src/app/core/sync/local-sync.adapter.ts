import { Injectable } from '@angular/core';
import { EMPTY, Observable } from 'rxjs';
import { BoardEvent } from '../models/board-event.model';
import { BoardState } from '../models/note.model';
import { seedBoard } from './seed-board';
import { SyncAdapter } from './sync-adapter';

// Versioned: a board saved before notes carried a `side` would lay out with its children missing,
// so a shape change takes the key with it rather than needing a migration.
const STORAGE_KEY = 'floating-notes:board:v2';
const WRITE_DEBOUNCE_MS = 250;

/**
 * Single-browser adapter: no peers, state persisted to localStorage.
 *
 * It deliberately persists the whole state rather than an event log — a real backend owns the log,
 * and keeping one here would only invite the demo to depend on replay semantics it won't have.
 */
@Injectable({ providedIn: 'root' })
export class LocalSyncAdapter implements SyncAdapter {
  readonly remote$: Observable<BoardEvent> = EMPTY;
  private writeTimer: ReturnType<typeof setTimeout> | null = null;

  snapshot(): BoardState | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedBoard();
    try {
      const parsed = JSON.parse(raw) as BoardState;
      return parsed?.notes ? parsed : seedBoard();
    } catch {
      return seedBoard();
    }
  }

  publish(_event: BoardEvent, state: BoardState): void {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      this.writeTimer = null;
    }, WRITE_DEBOUNCE_MS);
  }

  /** Demo affordance: wipe persistence and start over from the seed. */
  reset(): BoardState {
    localStorage.removeItem(STORAGE_KEY);
    return seedBoard();
  }
}
