import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { BoardStore } from '../core/board.store';
import { DragService } from '../core/drag.service';
import { isDescendantOf } from '../core/models/note.model';
import { noteType } from '../core/note-types';
import { ViewportService } from '../core/viewport.service';
import { NoteCardComponent } from './note-card.component';
import { PaletteComponent } from './palette.component';
import { UserSwitcherComponent } from './user-switcher.component';

const ZOOM_STEP = 1.15;

/**
 * The board surface: pan/zoom viewport, the world layer holding root notes, and the drag ghost.
 *
 * The world layer carries a single `translate(...) scale(...)`, so every descendant is positioned in
 * world coordinates and zoom costs nothing per note. The ghost lives outside that layer, in screen
 * space, because it must track the cursor exactly regardless of where the board has been panned.
 */
@Component({
  selector: 'app-board',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NoteCardComponent, PaletteComponent, UserSwitcherComponent],
  host: {
    '(pointerdown)': 'onPointerDown($event)',
    '(wheel)': 'onWheel($event)',
    '(window:keydown.escape)': 'drag.cancel()',
    '(contextmenu)': '$event.preventDefault()',
    '[class.panning]': 'panning()',
  },
  template: `
    <div class="world" [style.transform]="viewport.transform()">
      @for (root of store.roots(); track root.id) {
        <div class="root" [style.left.px]="root.x" [style.top.px]="root.y">
          <app-note-card [note]="root" />
        </div>
      }
    </div>

    @if (drag.drag(); as d) {
      <div
        class="ghost"
        [style.left.px]="d.screenX"
        [style.top.px]="d.screenY"
        [style.width.px]="d.width"
        [style.transform]="'scale(' + viewport.scale() + ')'"
      >
        @if (ghostNote(); as note) {
          <app-note-card [note]="note" [ghost]="true" />
        }
      </div>
      @if (!d.target?.valid) {
        <p class="reject">{{ rejectReason(d.typeId) }}</p>
      }
    }

    <div class="hud top-left"><app-palette /></div>
    <div class="hud top-right"><app-user-switcher /></div>
    <div class="hud bottom-left toolbar">
      <button type="button" (click)="zoom(1 / ZOOM_STEP)" title="Zoom out">−</button>
      <span class="pct">{{ zoomPercent() }}%</span>
      <button type="button" (click)="zoom(ZOOM_STEP)" title="Zoom in">+</button>
      <span class="sep"></span>
      <button type="button" (click)="viewport.reset()">Reset view</button>
      <button type="button" (click)="resetBoard()">Reset board</button>
    </div>
    <p class="hud bottom-right hint">
      Drag the background to pan · wheel to zoom · double-click a note to edit
    </p>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      overflow: hidden;
      background-color: #f1f5f9;
      background-image: radial-gradient(#cbd5e1 1px, transparent 1px);
      background-size: 24px 24px;
      cursor: default;
      touch-action: none;
      user-select: none;
      font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
    }
    :host(.panning) { cursor: grabbing; }

    .world {
      position: absolute;
      top: 0;
      left: 0;
      transform-origin: 0 0;
    }
    .root { position: absolute; width: 280px; }

    .ghost {
      position: fixed;
      z-index: 50;
      transform-origin: 0 0;
      pointer-events: none;
    }

    .reject {
      position: fixed;
      z-index: 51;
      left: 50%;
      bottom: 24px;
      transform: translateX(-50%);
      margin: 0;
      padding: 6px 14px;
      border-radius: 999px;
      background: #dc2626;
      color: #fff;
      font-size: 12px;
      pointer-events: none;
    }

    .hud { position: fixed; z-index: 40; }
    .top-left { top: 16px; left: 16px; }
    .top-right { top: 16px; right: 16px; }
    .bottom-left { bottom: 16px; left: 16px; }
    .bottom-right { bottom: 16px; right: 16px; }

    .toolbar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      background: rgba(255, 255, 255, 0.9);
      border-radius: 999px;
      box-shadow: 0 8px 24px -12px rgba(15, 23, 42, 0.4);
      backdrop-filter: blur(6px);
    }
    .toolbar button {
      border: 0;
      background: transparent;
      border-radius: 999px;
      padding: 3px 9px;
      font: inherit;
      font-size: 12px;
      color: #334155;
      cursor: pointer;
    }
    .toolbar button:hover { background: #f1f5f9; }
    .pct {
      font-size: 12px;
      color: #64748b;
      min-width: 42px;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
    .sep { width: 1px; height: 16px; background: #e2e8f0; }

    .hint {
      margin: 0;
      font-size: 11px;
      color: #94a3b8;
      pointer-events: none;
    }
  `,
})
export class BoardComponent {
  readonly store = inject(BoardStore);
  readonly viewport = inject(ViewportService);
  readonly drag = inject(DragService);

  protected readonly ZOOM_STEP = ZOOM_STEP;

  private panFrom: { x: number; y: number } | null = null;
  private readonly panActive = signal(false);
  readonly panning = this.panActive.asReadonly();

  readonly zoomPercent = computed(() => Math.round(this.viewport.scale() * 100));

  /** The note the ghost renders — an existing note, or a stand-in for a palette drag. */
  readonly ghostNote = computed(() => {
    const d = this.drag.drag();
    if (!d) return null;
    if (d.noteId) return this.store.get(d.noteId) ?? null;
    return {
      id: '__new__',
      typeId: d.typeId,
      parentId: null,
      text: '',
      x: 0,
      y: 0,
      order: 0,
      votes: [],
      createdBy: '',
      collapsed: false,
      updatedAt: 0,
    };
  });

  onPointerDown(event: PointerEvent): void {
    // Cards stop propagation on their own grab handles, so anything reaching here is background.
    const isBackground = !(event.target as HTMLElement).closest('[data-note-id], .hud');
    if (!isBackground && event.button !== 1) return;
    if (event.button !== 0 && event.button !== 1) return;

    this.panFrom = { x: event.clientX, y: event.clientY };
    this.panActive.set(true);

    const move = (e: PointerEvent) => {
      if (!this.panFrom) return;
      this.viewport.panBy(e.clientX - this.panFrom.x, e.clientY - this.panFrom.y);
      this.panFrom = { x: e.clientX, y: e.clientY };
    };
    const up = () => {
      this.panFrom = null;
      this.panActive.set(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  onWheel(event: WheelEvent): void {
    event.preventDefault();
    const factor = Math.pow(ZOOM_STEP, -event.deltaY / 100);
    this.viewport.zoomAt(event.clientX, event.clientY, factor);
  }

  zoom(factor: number): void {
    this.viewport.zoomAt(window.innerWidth / 2, window.innerHeight / 2, factor);
  }

  resetBoard(): void {
    this.store.resetToSeed();
    this.viewport.reset();
  }

  /** Explains why the current hover is refused, so the type rules teach themselves. */
  rejectReason(typeId: string): string {
    const d = this.drag.drag();
    const target = d?.target;
    const parent = target?.parentId ? this.store.get(target.parentId) : null;
    const type = noteType(typeId);
    if (!parent) {
      return `A ${type.label.toLowerCase()} can't sit on the board on its own`;
    }
    if (d?.noteId && (parent.id === d.noteId || isDescendantOf({ notes: this.store.notes() }, parent.id, d.noteId))) {
      return `A note can't be dropped inside itself`;
    }
    return `A ${type.label.toLowerCase()} can't go inside a ${noteType(parent.typeId).label.toLowerCase()}`;
  }
}
