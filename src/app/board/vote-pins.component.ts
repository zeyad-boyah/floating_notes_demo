import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { UserService } from '../core/user.service';

/** The dot-vote strip on a note. One pin per user; the current user's pin is ringed. */
@Component({
  selector: 'app-vote-pins',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="vote"
      [class.voted]="hasVoted()"
      (pointerdown)="$event.stopPropagation()"
      (click)="toggle.emit()"
      [title]="hasVoted() ? 'Remove your vote' : 'Vote for this note'"
    >
      <span class="pins">
        @for (pin of pins(); track pin.id) {
          <span
            class="pin"
            [style.background]="pin.color"
            [class.mine]="pin.id === me().id"
            [title]="pin.name"
          ></span>
        } @empty {
          <span class="pin empty"></span>
        }
      </span>
      <span class="count">{{ votes().length || '' }}</span>
    </button>
  `,
  styles: `
    .vote {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 2px 8px 2px 4px;
      border: 1px solid transparent;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.45);
      cursor: pointer;
      font: inherit;
      font-size: 11px;
      line-height: 1;
      color: inherit;
      transition: background 0.12s, border-color 0.12s;
    }
    .vote:hover { background: rgba(255, 255, 255, 0.85); }
    .vote.voted { border-color: currentColor; }

    .pins { display: inline-flex; }
    .pin {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 1.5px solid rgba(255, 255, 255, 0.9);
      margin-right: -4px;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
    }
    .pin.mine { border-color: #111827; }
    .pin.empty {
      background: transparent;
      border-style: dashed;
      border-color: currentColor;
      opacity: 0.4;
      box-shadow: none;
    }
    .count { min-width: 8px; font-variant-numeric: tabular-nums; opacity: 0.75; }
  `,
})
export class VotePinsComponent {
  private readonly users = inject(UserService);

  readonly votes = input.required<string[]>();
  readonly toggle = output<void>();

  readonly me = this.users.current;
  readonly pins = computed(() => this.votes().map((id) => this.users.byId(id)));
  readonly hasVoted = computed(() => this.votes().includes(this.me().id));
}
