import { Injectable, computed, signal } from '@angular/core';

export interface Viewport {
  /** Screen-space translation applied before scaling. */
  x: number;
  y: number;
  scale: number;
}

export const MIN_SCALE = 0.2;
export const MAX_SCALE = 3;

export interface Point {
  x: number;
  y: number;
}

/**
 * The world→screen transform for the board.
 *
 * Every stored coordinate is a world coordinate; every pointer coordinate is a screen coordinate.
 * All drag maths goes through `screenToWorld`, which is what keeps dragging exact at any zoom.
 */
@Injectable({ providedIn: 'root' })
export class ViewportService {
  readonly viewport = signal<Viewport>({ x: 0, y: 0, scale: 1 });
  readonly scale = computed(() => this.viewport().scale);

  /** `transform` for the world layer. Pairs with `transform-origin: 0 0`. */
  readonly transform = computed(() => {
    const v = this.viewport();
    return `translate(${v.x}px, ${v.y}px) scale(${v.scale})`;
  });

  screenToWorld(sx: number, sy: number): Point {
    const v = this.viewport();
    return { x: (sx - v.x) / v.scale, y: (sy - v.y) / v.scale };
  }

  worldToScreen(wx: number, wy: number): Point {
    const v = this.viewport();
    return { x: wx * v.scale + v.x, y: wy * v.scale + v.y };
  }

  panBy(dx: number, dy: number): void {
    this.viewport.update((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  }

  /** Zoom keeping the world point currently under (sx, sy) pinned to that screen position. */
  zoomAt(sx: number, sy: number, factor: number): void {
    this.viewport.update((v) => {
      const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
      if (scale === v.scale) return v;
      const k = scale / v.scale;
      return { scale, x: sx - (sx - v.x) * k, y: sy - (sy - v.y) * k };
    });
  }

  setScaleAtCenter(scale: number, viewWidth: number, viewHeight: number): void {
    const target = clamp(scale, MIN_SCALE, MAX_SCALE);
    this.zoomAt(viewWidth / 2, viewHeight / 2, target / this.viewport().scale);
  }

  reset(): void {
    this.viewport.set({ x: 0, y: 0, scale: 1 });
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
