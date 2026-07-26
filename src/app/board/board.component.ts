import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { BoardStore } from '../core/board.store';
import { DragService } from '../core/drag.service';
import { NOTE_GAP, NOTE_SIZE } from '../core/layout';
import { Note, isDescendantOf } from '../core/models/note.model';
import { noteType } from '../core/note-types';
import { ViewportService } from '../core/viewport.service';
import { NoteCardComponent } from './note-card.component';
import { PaletteComponent } from './palette.component';
import { UserSwitcherComponent } from './user-switcher.component';

const ZOOM_STEP = 1.15;

interface PlacedNote {
  note: Note;
  x: number;
  y: number;
  dragging: boolean;
}

interface Connector {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

/**
 * The board surface: pan/zoom viewport, every square positioned from the computed layout, and the
 * connector stubs that make an attachment visible rather than merely adjacent.
 *
 * Notes are rendered flat — nesting is expressed by position, not by DOM containment — so a cluster
 * of any depth costs one absolutely positioned element per note.
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
      @for (link of connectors(); track link.id) {
        <span
          class="link"
          [style.left.px]="link.x"
          [style.top.px]="link.y"
          [style.width.px]="link.w"
          [style.height.px]="link.h"
          [style.background]="link.color"
        ></span>
      }
      @for (placed of placedNotes(); track placed.note.id) {
        <div
          class="square"
          [class.lifted]="placed.dragging"
          [style.left.px]="placed.x"
          [style.top.px]="placed.y"
          [style.width.px]="SIZE"
          [style.height.px]="SIZE"
        >
          <app-note-card [note]="placed.note" />
        </div>
      }
    </div>

    @if (drag.drag(); as d) {
      @if (!d.target?.valid) {
        <p class="reject">{{ rejectReason(d.typeId) }}</p>
      }
      @if (d.kind === 'create' && d.target?.valid) {
        <div
          class="new-ghost"
          [style.transform]="ghostTransform(d.worldX, d.worldY)"
          [style.width.px]="SIZE"
          [style.height.px]="SIZE"
          [style.background]="ghostColor(d.typeId)"
        ></div>
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
      Drag the background to pan · wheel to zoom · drop a note on any edge to attach it
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

    .square { position: absolute; }
    .square.lifted { z-index: 20; }

    .link { position: absolute; border-radius: 1px; opacity: 0.55; }

    .new-ghost {
      position: fixed;
      z-index: 50;
      transform-origin: 0 0;
      border-radius: 4px;
      opacity: 0.7;
      box-shadow: 0 18px 30px -14px rgba(15, 23, 42, 0.6);
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
  protected readonly SIZE = NOTE_SIZE;

  private panFrom: { x: number; y: number } | null = null;
  private readonly panActive = signal(false);
  readonly panning = this.panActive.asReadonly();

  readonly zoomPercent = computed(() => Math.round(this.viewport.scale() * 100));

  /**
   * Laid-out notes, with the dragged cluster shifted to follow the cursor. The offset is applied
   * here rather than written to the store, so an abandoned drag needs no undo.
   */
  readonly placedNotes = computed<PlacedNote[]>(() => {
    const layout = this.store.layout();
    const delta = this.drag.dragDelta();
    const moving = this.drag.draggingIds();
    const out: PlacedNote[] = [];

    for (const note of Object.values(this.store.notes())) {
      const place = layout[note.id];
      if (!place) continue; // hidden inside a collapsed parent
      const dragging = moving.has(note.id);
      out.push({
        note,
        x: place.x + (dragging && delta ? delta.dx : 0),
        y: place.y + (dragging && delta ? delta.dy : 0),
        dragging,
      });
    }
    return out;
  });

  /** A short bar bridging the gap between a parent edge and each note docked to it. */
  readonly connectors = computed<Connector[]>(() => {
    const placed = new Map(this.placedNotes().map((p) => [p.note.id, p]));
    const links: Connector[] = [];

    for (const child of placed.values()) {
      const note = child.note;
      if (!note.parentId || !note.side) continue;
      const parent = placed.get(note.parentId);
      if (!parent) continue;
      // Only draw where the pair is still in its resting arrangement; a half-dragged cluster
      // would otherwise sprout a bar stretching across the board.
      if (child.dragging !== parent.dragging) continue;

      const color = noteType(note.typeId).accent;
      const id = `l-${note.id}`;
      const cx = child.x + NOTE_SIZE / 2;
      const cy = child.y + NOTE_SIZE / 2;
      switch (note.side) {
        case 'right':
          links.push({ id, x: parent.x + NOTE_SIZE, y: cy - 1.5, w: NOTE_GAP, h: 3, color });
          break;
        case 'left':
          links.push({ id, x: child.x + NOTE_SIZE, y: cy - 1.5, w: NOTE_GAP, h: 3, color });
          break;
        case 'bottom':
          links.push({ id, x: cx - 1.5, y: parent.y + NOTE_SIZE, w: 3, h: NOTE_GAP, color });
          break;
        case 'top':
          links.push({ id, x: cx - 1.5, y: child.y + NOTE_SIZE, w: 3, h: NOTE_GAP, color });
          break;
      }
    }
    return links;
  });

  ghostTransform(worldX: number, worldY: number): string {
    const screen = this.viewport.worldToScreen(worldX, worldY);
    return `translate(${screen.x}px, ${screen.y}px) scale(${this.viewport.scale()})`;
  }

  ghostColor(typeId: string): string {
    return noteType(typeId).color;
  }

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
    this.viewport.zoomAt(event.clientX, event.clientY, Math.pow(ZOOM_STEP, -event.deltaY / 100));
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
    if (!parent) return `A ${type.label.toLowerCase()} can't sit on the board on its own`;
    if (
      d?.noteId &&
      (parent.id === d.noteId || isDescendantOf({ notes: this.store.notes() }, parent.id, d.noteId))
    ) {
      return `A note can't be attached to itself`;
    }
    return `A ${type.label.toLowerCase()} can't attach to a ${noteType(parent.typeId).label.toLowerCase()}`;
  }
}
