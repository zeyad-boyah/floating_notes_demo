import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DragService } from '../core/drag.service';
import { NOTE_TYPE_LIST, NOTE_TYPES } from '../core/note-types';

/** Drag source for new notes. Uses the same drag machinery as moving, so the rules apply equally. */
@Component({
  selector: 'app-palette',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="label">Drag onto the board</p>
    @for (type of types; track type.id) {
      <div
        class="swatch"
        [style.background]="type.color"
        [style.color]="type.ink"
        [style.border-color]="type.accent"
        (pointerdown)="drag.beginCreate($event, type.id)"
      >
        <strong>{{ type.label }}</strong>
        <small>{{ hint(type.id) }}</small>
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      width: 168px;
      background: rgba(255, 255, 255, 0.9);
      border-radius: 10px;
      box-shadow: 0 8px 24px -12px rgba(15, 23, 42, 0.4);
      backdrop-filter: blur(6px);
    }
    .label {
      margin: 0;
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #64748b;
    }
    .swatch {
      padding: 7px 9px;
      border-radius: 7px;
      border-left: 3px solid;
      cursor: grab;
      touch-action: none;
      user-select: none;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.15);
    }
    .swatch:active { cursor: grabbing; }
    .swatch strong { display: block; font-size: 12px; }
    .swatch small { font-size: 10px; opacity: 0.7; }
  `,
})
export class PaletteComponent {
  readonly drag = inject(DragService);
  readonly types = NOTE_TYPE_LIST;

  /** Spells out the attachment rule so the type system is visible without trial and error. */
  hint(typeId: string): string {
    const type = NOTE_TYPES[typeId];
    if (type.canBeRoot) return 'goes on the board';
    const parents = type.allowedParents.map((p) => NOTE_TYPES[p].label.toLowerCase());
    return `onto a ${parents.join(' or ')}`;
  }
}
