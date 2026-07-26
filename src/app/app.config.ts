import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { LocalSyncAdapter } from './core/sync/local-sync.adapter';
import { SYNC_ADAPTER } from './core/sync/sync-adapter';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    // The one line a real backend would change.
    { provide: SYNC_ADAPTER, useExisting: LocalSyncAdapter },
  ],
};
