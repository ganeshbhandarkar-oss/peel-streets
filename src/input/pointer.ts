import { cellAt, isPeelable, topLayer, type Move } from '../engine/grid';
import { segmentsFlip, segmentsRotate } from '../engine/pieces';
import type { Board, Pos, Sticker } from '../engine/types';
import type { BoardView } from '../render/board';

export interface InputHooks {
  board(): Board;
  enabled(): boolean;
  onPeelStart(p: Pos): void;
  onLift(p: Pos): void;
  onPlace(m: Move, fromX: number, fromY: number): void;
  onCancel(): void;
  onDeny(p: Pos | null, reason: string): void;
  onHeldChange(): void;
}

type Mode =
  | { k: 'idle' }
  | { k: 'pressing'; pos: Pos; sx: number; sy: number; id: number }
  | { k: 'autopeel'; pos: Pos; t0: number }
  | { k: 'held'; fresh: boolean }
  | { k: 'dragheld'; id: number; sx: number; sy: number; moved: boolean };

/**
 * Touch + mouse input for the board.
 *  - press & drag a sticker: the corner curls with your finger, then it lifts and follows you;
 *    release over a glowing lot to snap it there.
 *  - tap a sticker: it peels itself and hovers; rotate / flip with the buttons (or R / F),
 *    then tap a glowing lot (or its own tile) to snap it.
 */
export class BoardInput {
  private mode: Mode = { k: 'idle' };
  private view: BoardView;
  private hooks: InputHooks;
  private el: HTMLCanvasElement;

  constructor(view: BoardView, hooks: InputHooks) {
    this.view = view;
    this.hooks = hooks;
    this.el = view.canvas;
    this.el.addEventListener('pointerdown', this.down);
    window.addEventListener('pointermove', this.move);
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.up);
    this.el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.view.held) this.rotate();
    });
  }

  get holding() {
    return !!this.view.held;
  }

  reset() {
    this.mode = { k: 'idle' };
    this.view.peel = null;
    this.view.held = null;
  }

  private local(e: PointerEvent): [number, number] {
    const r = this.el.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private down = (e: PointerEvent) => {
    if (!this.hooks.enabled()) return;
    e.preventDefault();
    const [x, y] = this.local(e);
    const pos = this.view.cellAtPoint(x, y);
    const held = this.view.held;
    if (held) {
      const near = Math.hypot(x - held.x, y - held.y) < this.view.cell * 0.55;
      if (near) {
        // grab the hovering sticker: drag it somewhere, or tap it to stick it back on its tile
        this.mode = { k: 'dragheld', id: e.pointerId, sx: x, sy: y, moved: false };
        return;
      }
      if (pos && this.view.isValidTarget(pos.r, pos.c)) {
        this.place(pos);
        return;
      }
      this.hooks.onDeny(pos, 'Snap it onto a glowing empty lot.');
      return;
    }
    if (!pos) return;
    const b = this.hooks.board();
    if (!isPeelable(b, pos)) {
      const cell = cellAt(b, pos);
      const t = topLayer(cell);
      if (t && t.kind === 'sticker' && t.pinned) this.hooks.onDeny(pos, 'Pinned! That sticker stays put.');
      else if (t && t.kind === 'rubble') this.hooks.onDeny(pos, 'Rubble. Nothing sticks here.');
      return;
    }
    this.mode = { k: 'pressing', pos, sx: x, sy: y, id: e.pointerId };
    // curl from the corner nearest the touch
    const [cx, cy] = this.view.center(pos);
    const corner = x < cx ? (y < cy ? 0 : 3) : y < cy ? 1 : 2;
    this.view.peel = { pos, corner, t: 0.08 };
    this.hooks.onPeelStart(pos);
  };

  private move = (e: PointerEvent) => {
    const m = this.mode;
    if (m.k === 'pressing' && e.pointerId === m.id) {
      const [x, y] = this.local(e);
      const d = Math.hypot(x - m.sx, y - m.sy);
      const t = Math.min(1, 0.08 + d / (this.view.cell * 0.75));
      if (this.view.peel) this.view.peel.t = t;
      if (t >= 1) this.lift(m.pos, x, y, true);
    } else if (m.k === 'dragheld' && e.pointerId === m.id && this.view.held) {
      const [x, y] = this.local(e);
      if (Math.hypot(x - m.sx, y - m.sy) > 6) m.moved = true;
      if (m.moved) {
        this.view.held.x = x;
        this.view.held.y = y;
        this.view.held.dragging = true;
      }
    }
  };

  private up = (e: PointerEvent) => {
    const m = this.mode;
    if (m.k === 'pressing' && e.pointerId === m.id) {
      // a tap (or a short drag): finish the peel automatically
      this.mode = { k: 'autopeel', pos: m.pos, t0: performance.now() };
      const start = this.view.peel?.t ?? 0;
      const t0 = performance.now();
      const tick = () => {
        if (this.mode.k !== 'autopeel' || !this.view.peel) return;
        const t = start + (performance.now() - t0) / 170;
        this.view.peel.t = Math.min(1, t);
        if (t >= 1) {
          const [cx, cy] = this.view.center(m.pos);
          this.lift(m.pos, cx, cy - this.view.cell * 0.12, false);
        } else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      return;
    }
    if (m.k === 'dragheld' && e.pointerId === m.id && this.view.held) {
      const held = this.view.held;
      if (!m.moved) {
        // simple tap on the hovering sticker: snap back onto its own tile
        this.mode = { k: 'held', fresh: false };
        this.place(held.origin);
        return;
      }
      const [x, y] = this.local(e);
      const pos = this.view.cellAtPoint(x, y);
      if (pos && this.view.isValidTarget(pos.r, pos.c)) {
        this.place(pos);
      } else {
        this.hover(held.origin);
        this.hooks.onDeny(null, 'That spot is taken. Try a glowing lot.');
      }
    }
  };

  private lift(pos: Pos, x: number, y: number, dragging: boolean) {
    const st = topLayer(cellAt(this.hooks.board(), pos)) as Sticker;
    this.view.peel = null;
    this.view.held = { origin: pos, sticker: st, segments: st.segments, x, y, dragging, rotFx: 0, flipFx: 1, since: performance.now() };
    this.mode = dragging ? { k: 'dragheld', id: (this.mode as any).id ?? 0, sx: x, sy: y, moved: true } : { k: 'held', fresh: true };
    this.hooks.onLift(pos);
    this.hooks.onHeldChange();
  }

  private hover(origin: Pos) {
    const h = this.view.held!;
    const [cx, cy] = this.view.center(origin);
    h.x = cx;
    h.y = cy - this.view.cell * 0.12;
    h.dragging = false;
    this.mode = { k: 'held', fresh: false };
  }

  private place(to: Pos) {
    const h = this.view.held!;
    const move: Move = { from: h.origin, to, segments: h.segments };
    const fx = h.x;
    const fy = h.y;
    this.view.held = null;
    this.mode = { k: 'idle' };
    this.hooks.onPlace(move, fx, fy);
    this.hooks.onHeldChange();
  }

  rotate(): boolean {
    const h = this.view.held;
    if (!h) return false;
    if (h.sticker.rigid) {
      this.hooks.onDeny(null, 'Stiff sticker: it only flips.');
      return false;
    }
    h.segments = segmentsRotate(h.segments, 1);
    h.rotFx = -Math.PI / 2;
    return true;
  }

  flip(): boolean {
    const h = this.view.held;
    if (!h) return false;
    h.segments = segmentsFlip(h.segments);
    h.flipFx = -1;
    return true;
  }

  /** Put the held sticker back exactly as it was (free). */
  cancel() {
    const h = this.view.held;
    if (!h) return;
    this.view.land(h.origin, h.x, h.y);
    this.view.held = null;
    this.mode = { k: 'idle' };
    this.hooks.onCancel();
    this.hooks.onHeldChange();
  }
}
