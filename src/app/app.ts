import { ChangeDetectionStrategy, Component } from '@angular/core';
import { BoardComponent } from './board/board.component';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BoardComponent],
  template: `<app-board />`,
})
export class App {}
