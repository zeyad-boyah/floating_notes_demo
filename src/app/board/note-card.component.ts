import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { BoardStore } from '../core/board.store';
import { DragService } from '../core/drag.service';
import { Note } from '../core/models/note.model';
import { acceptedChildTypes, noteType } from '../core/note-types';
import { UserService } from '../core/user.service';
import { VotePinsComponent } from './vote-pins.component';

/**
 * One square sticky note.
 *
 * Fixed size, so the docking layout stays predictable: long text steps down a font size or two and
 * then clips under a fade rather than resizing the square. The card renders only itself — children
 * are separate squares positioned around it by the board.
 */
@Component({
  selector: 'app-note-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VotePinsComponent],
  host: {
    '[attr.data-note-id]': 'note().id',
    '[class.is-dragging]': 'dragging()',
    '[class.drop-bad]': 'rejected()',
    '[class.dock-left]': 'activeSide() === "left"',
    '[class.dock-right]': 'activeSide() === "right"',
    '[class.dock-top]': 'activeSide() === "top"',
    '[class.dock-bottom]': 'activeSide() === "bottom"',
    '[style.--sticky]': 'type().color',
    '[style.--accent]': 'type().accent',
    '[style.--ink]': 'type().ink',
  },
  template: `
    <header class="head" (pointerdown)="onGrab($event)">
      <span class="chip">{{ type().label }}</span>
      <span class="spacer"></span>
      @if (childCount() > 0) {
        <button class="icon" type="button" (pointerdown)="$event.stopPropagation()"
                (click)="toggleCollapse()"
                [title]="note().collapsed ? 'Show attached notes' : 'Hide attached notes'">
          {{ note().collapsed ? '+' + childCount() : '−' }}
        </button>
      }
      <button class="icon danger" type="button" (pointerdown)="$event.stopPropagation()"
              (click)="remove()" title="Delete note and everything attached to it">×</button>
    </header>

    <div class="body" (dblclick)="startEditing()">
      @if (editing()) {
        <textarea
          #editor
          class="editor"
          [value]="note().text"
          [placeholder]="type().placeholder"
          [style.font-size.px]="fontSize()"
          (pointerdown)="$event.stopPropagation()"
          (blur)="commit(editor.value)"
          (keydown)="onEditorKey($event, editor)"
        ></textarea>
      } @else {
        <p class="text" [class.placeholder]="!note().text" [style.font-size.px]="fontSize()">
          {{ note().text || type().placeholder }}
        </p>
      }
    </div>

    <footer class="foot">
      <app-vote-pins [votes]="note().votes" (toggle)="vote()" />
      <span class="author">{{ author().name }}</span>
    </footer>

    @if (childCount() === 0 && accepts().length) {
      <span class="hint">attach {{ acceptsLabel() }} to any side</span>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      position: relative;
      width: 100%;
      height: 100%;
      background: var(--sticky);
      color: var(--ink);
      border-radius: 4px;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.2), 0 8px 16px -10px rgba(15, 23, 42, 0.4);
      transition: box-shadow 0.12s, outline-color 0.12s;
      outline: 2px solid transparent;
      outline-offset: 1px;
      overflow: hidden;
    }
    :host(.is-dragging) {
      box-shadow: 0 20px 34px -14px rgba(15, 23, 42, 0.6);
      cursor: grabbing;
    }
    :host(.drop-bad) { outline-color: #dc2626; }
    :host(.drop-bad) .body { opacity: 0.5; }

    /* The edge a drop would dock to lights up, so the direction is committed before release. */
    :host(.dock-left)::after,
    :host(.dock-right)::after,
    :host(.dock-top)::after,
    :host(.dock-bottom)::after {
      content: '';
      position: absolute;
      background: var(--accent);
    }
    :host(.dock-left)::after { inset: 0 auto 0 0; width: 5px; }
    :host(.dock-right)::after { inset: 0 0 0 auto; width: 5px; }
    :host(.dock-top)::after { inset: 0 0 auto 0; height: 5px; }
    :host(.dock-bottom)::after { inset: auto 0 0 0; height: 5px; }

    .head {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 5px 2px 9px;
      cursor: grab;
      touch-action: none;
      flex: 0 0 auto;
    }
    .head:active { cursor: grabbing; }
    .spacer { flex: 1; }

    .chip {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      color: var(--accent);
    }

    .icon {
      border: 0;
      background: transparent;
      color: inherit;
      opacity: 0.4;
      cursor: pointer;
      font-size: 12px;
      line-height: 1;
      padding: 2px 4px;
      border-radius: 3px;
    }
    .icon:hover { opacity: 1; background: rgba(255, 255, 255, 0.6); }
    .icon.danger:hover { color: #b91c1c; }

    .body {
      flex: 1 1 auto;
      position: relative;
      padding: 2px 10px 0;
      overflow: hidden;
      /* Clipped text fades out instead of being cut mid-line. */
      mask-image: linear-gradient(#000 calc(100% - 14px), transparent);
    }
    .text {
      margin: 0;
      line-height: 1.3;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .text.placeholder { opacity: 0.4; font-style: italic; }

    .editor {
      width: 100%;
      height: 100%;
      border: 0;
      border-radius: 3px;
      padding: 2px 4px;
      margin: -2px -4px;
      background: rgba(255, 255, 255, 0.8);
      color: inherit;
      font: inherit;
      line-height: 1.3;
      resize: none;
      outline: 1px solid var(--accent);
    }

    .foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      padding: 4px 8px 6px;
      font-size: 10px;
      flex: 0 0 auto;
    }
    .author { opacity: 0.45; }

    .hint {
      position: absolute;
      inset: auto 0 -16px 0;
      text-align: center;
      font-size: 9px;
      color: #94a3b8;
      pointer-events: none;
    }
  `,
})
export class NoteCardComponent {
  private readonly store = inject(BoardStore);
  private readonly dragService = inject(DragService);
  private readonly users = inject(UserService);
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly note = input.required<Note>();

  private readonly editor = viewChild<ElementRef<HTMLTextAreaElement>>('editor');
  readonly editing = signal(false);

  readonly type = computed(() => noteType(this.note().typeId));
  readonly childCount = computed(() => this.store.childrenOf(this.note().id).length);
  readonly author = computed(() => this.users.byId(this.note().createdBy));
  readonly accepts = computed(() => acceptedChildTypes(this.note().typeId));
  readonly acceptsLabel = computed(() =>
    this.accepts()
      .map((t) => t.label.toLowerCase() + 's')
      .join(' or '),
  );

  /** Two steps down before clipping — enough for a sentence or two at full size. */
  readonly fontSize = computed(() => {
    const length = this.note().text.length;
    if (length > 150) return 10;
    if (length > 70) return 12;
    return 14;
  });

  readonly dragging = computed(() => this.dragService.draggingIds().has(this.note().id));
  readonly activeSide = computed(() => this.dragService.activeSideFor(this.note().id));
  readonly rejected = computed(() => {
    const target = this.dragService.drag()?.target;
    return !!target && !target.valid && target.parentId === this.note().id;
  });

  onGrab(event: PointerEvent): void {
    if (this.editing() || event.button !== 0) return;
    event.stopPropagation();
    this.dragService.beginMove(event, this.note());
  }

  startEditing(): void {
    this.editing.set(true);
    queueMicrotask(() => {
      const el = this.editor()?.nativeElement;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }

  onEditorKey(event: KeyboardEvent, el: HTMLTextAreaElement): void {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      this.editing.set(false);
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      this.commit(el.value);
    }
  }

  commit(text: string): void {
    this.store.setText(this.note().id, text.trim());
    this.editing.set(false);
  }

  toggleCollapse(): void {
    this.store.setCollapsed(this.note().id, !this.note().collapsed);
  }

  vote(): void {
    this.store.toggleVote(this.note().id, this.users.current().id);
  }

  remove(): void {
    this.store.remove(this.note().id);
  }
}
