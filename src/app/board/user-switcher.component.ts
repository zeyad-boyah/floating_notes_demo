import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { UserService } from '../core/user.service';

/**
 * Switches which simulated participant you are. Without it "one vote per user" is invisible in a
 * single browser — this is the stand-in for the presence layer a real deployment would provide.
 */
@Component({
  selector: 'app-user-switcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="label">You are</span>
    @for (user of users.users; track user.id) {
      <button
        type="button"
        class="who"
        [class.active]="user.id === users.current().id"
        [style.--who]="user.color"
        (click)="users.setCurrent(user.id)"
      >
        <span class="dot"></span>{{ user.name }}
      </button>
    }
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      background: rgba(255, 255, 255, 0.9);
      border-radius: 999px;
      box-shadow: 0 8px 24px -12px rgba(15, 23, 42, 0.4);
      backdrop-filter: blur(6px);
    }
    .label {
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #64748b;
      margin-right: 2px;
    }
    .who {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      border: 1px solid transparent;
      border-radius: 999px;
      background: transparent;
      padding: 3px 9px;
      font: inherit;
      font-size: 12px;
      color: #334155;
      cursor: pointer;
    }
    .who:hover { background: #f1f5f9; }
    .who.active { border-color: var(--who); background: #fff; font-weight: 600; }
    .dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: var(--who);
    }
  `,
})
export class UserSwitcherComponent {
  readonly users = inject(UserService);
}
