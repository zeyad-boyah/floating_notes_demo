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
 * One sticky note, rendering its children inline.
 *
 * Nesting is plain flex layout: a child is a DOM child of its parent's `.children` container, so the
 * parent grows to fit and moving the parent moves the whole subtree with zero layout maths. Only
 * root cards are absolutely positioned (by the board), in world coordinates.
 */
@Component({
  selector: 'app-note-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VotePinsComponent],
  host: {
    '[attr.data-note-id]': 'ghost() ? null : note().id',
    '[class.is-dragging]': 'isDragging()',
    '[class.is-ghost]': 'ghost()',
    '[class.drop-ok]': 'dropState() === "ok"',
    '[class.drop-bad]': 'dropState() === "bad"',
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
                (click)="toggleCollapse()" [title]="note().collapsed ? 'Expand' : 'Collapse'">
          {{ note().collapsed ? '▸' : '▾' }}
        </button>
      }
      @if (!ghost()) {
        <button class="icon danger" type="button" (pointerdown)="$event.stopPropagation()"
                (click)="remove()" title="Delete note and its children">×</button>
      }
    </header>

    <div class="body" (dblclick)="startEditing()">
      @if (editing()) {
        <textarea
          #editor
          class="editor"
          [value]="note().text"
          [placeholder]="type().placeholder"
          (pointerdown)="$event.stopPropagation()"
          (blur)="commit(editor.value)"
          (keydown)="onEditorKey($event, editor)"
          (input)="autosize(editor)"
        ></textarea>
      } @else if (note().text) {
        <p class="text">{{ note().text }}</p>
      } @else {
        <p class="text placeholder">{{ type().placeholder }}</p>
      }
    </div>

    <footer class="foot">
      <app-vote-pins [votes]="note().votes" (toggle)="vote()" />
      <span class="author">{{ author().name }}</span>
    </footer>

    @if (!note().collapsed) {
      <div class="children" [attr.data-children-of]="ghost() ? null : note().id">
        @for (child of children(); track child.id; let i = $index) {
          @if (insertAt() === i) { <div class="insert"></div> }
          <!-- ghost propagates so the dragged copy never shadows real drop-target selectors -->
          <app-note-card [note]="child" [ghost]="ghost()" />
        }
        @if (insertAt() === childCount()) { <div class="insert"></div> }
        @if (childCount() === 0 && accepts().length) {
          <p class="slot">Drop {{ acceptsLabel() }} here</p>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      background: var(--sticky);
      color: var(--ink);
      border-radius: 8px;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.18), 0 6px 14px -8px rgba(15, 23, 42, 0.35);
      transition: box-shadow 0.15s, outline-color 0.15s, transform 0.15s;
      outline: 2px solid transparent;
      outline-offset: 2px;
    }
    :host(.is-dragging) { opacity: 0.35; pointer-events: none; }
    :host(.is-ghost) {
      transform: rotate(1.5deg);
      box-shadow: 0 18px 32px -12px rgba(15, 23, 42, 0.55);
    }
    :host(.drop-ok) { outline-color: var(--accent); }
    :host(.drop-bad) { outline-color: #dc2626; }
    :host(.drop-bad) .body { opacity: 0.5; }

    .head {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 6px 3px 8px;
      cursor: grab;
      touch-action: none;
    }
    .head:active { cursor: grabbing; }
    .spacer { flex: 1; }

    .chip {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--accent);
    }

    .icon {
      border: 0;
      background: transparent;
      color: inherit;
      opacity: 0.45;
      cursor: pointer;
      font-size: 13px;
      line-height: 1;
      padding: 2px 4px;
      border-radius: 4px;
    }
    .icon:hover { opacity: 1; background: rgba(255, 255, 255, 0.6); }
    .icon.danger:hover { color: #b91c1c; }

    .body { padding: 0 10px 6px; }
    .text {
      margin: 0;
      font-size: 13px;
      line-height: 1.35;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      min-height: 18px;
    }
    .text.placeholder { opacity: 0.45; font-style: italic; }

    .editor {
      width: 100%;
      border: 0;
      border-radius: 4px;
      padding: 2px 4px;
      margin: -2px -4px;
      background: rgba(255, 255, 255, 0.75);
      color: inherit;
      font: inherit;
      font-size: 13px;
      line-height: 1.35;
      resize: none;
      overflow: hidden;
      outline: 1px solid var(--accent);
    }

    .foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 0 8px 6px;
      font-size: 11px;
    }
    .author { opacity: 0.5; }

    .children {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 8px;
      margin: 0 4px 4px;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.35);
      min-height: 12px;
    }
    .children:empty { display: none; }

    .insert {
      height: 3px;
      margin: -1px 0;
      border-radius: 2px;
      background: var(--accent);
    }

    .slot {
      margin: 0;
      padding: 8px 6px;
      border: 1px dashed currentColor;
      border-radius: 5px;
      opacity: 0.35;
      font-size: 11px;
      text-align: center;
    }
  `,
})
export class NoteCardComponent {
  private readonly store = inject(BoardStore);
  private readonly dragService = inject(DragService);
  private readonly users = inject(UserService);
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly note = input.required<Note>();
  /** Ghost copies follow the cursor and must not participate in hit-testing or editing. */
  readonly ghost = input(false);

  private readonly editor = viewChild<ElementRef<HTMLTextAreaElement>>('editor');
  readonly editing = signal(false);

  readonly type = computed(() => noteType(this.note().typeId));
  readonly children = computed(() => this.store.childrenOf(this.note().id));
  readonly childCount = computed(() => this.children().length);
  readonly author = computed(() => this.users.byId(this.note().createdBy));
  readonly accepts = computed(() => acceptedChildTypes(this.note().typeId));
  readonly acceptsLabel = computed(() =>
    this.accepts()
      .map((t) => t.label.toLowerCase() + 's')
      .join(' or '),
  );

  readonly isDragging = computed(() => !this.ghost() && this.dragService.isDragging(this.note().id));

  /** 'ok' | 'bad' | null — the highlight shown while something hovers this card. */
  readonly dropState = computed(() => {
    if (this.ghost()) return null;
    const target = this.dragService.drag()?.target;
    if (!target || target.parentId !== this.note().id) return null;
    return target.valid ? 'ok' : 'bad';
  });

  /**
   * Slot index to draw the insertion line at, or -1.
   *
   * The store's index excludes the note being dragged, so when that note is already a child here we
   * shift the line down past its (still rendered, faded) placeholder to keep the preview honest.
   */
  readonly insertAt = computed(() => {
    if (this.ghost()) return -1;
    const drag = this.dragService.drag();
    const target = drag?.target;
    if (!target?.valid || target.parentId !== this.note().id) return -1;
    const from = this.children().findIndex((c) => c.id === drag!.noteId);
    return from >= 0 && from < target.index ? target.index + 1 : target.index;
  });

  onGrab(event: PointerEvent): void {
    if (this.ghost() || this.editing() || event.button !== 0) return;
    event.stopPropagation();
    this.dragService.beginMove(event, this.note(), this.host.nativeElement);
  }

  startEditing(): void {
    if (this.ghost()) return;
    this.editing.set(true);
    queueMicrotask(() => {
      const el = this.editor()?.nativeElement;
      if (!el) return;
      this.autosize(el);
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

  autosize(el: HTMLTextAreaElement): void {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
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
