import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { BoardEvent } from '../models/board-event.model';
import { BoardState } from '../models/note.model';

/**
 * The seam between the board and however it is shared.
 *
 * The demo ships `LocalSyncAdapter` (single browser + localStorage). A real backend implements the
 * same three members — the store and every component stay unchanged.
 */
export interface SyncAdapter {
  /** Events originating elsewhere (other users). Never emits in local mode. */
  readonly remote$: Observable<BoardEvent>;
  /** Initial state, or null to start from the seed board. */
  snapshot(): BoardState | null;
  /** Broadcast a locally-produced event. Already applied locally by the time this is called. */
  publish(event: BoardEvent, state: BoardState): void;
  /** Optional demo affordance: discard everything and return a fresh starting state. */
  reset?(): BoardState;
}

export const SYNC_ADAPTER = new InjectionToken<SyncAdapter>('SYNC_ADAPTER');
