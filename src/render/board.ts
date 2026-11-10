import { cellAt, idx, topLayer } from '../engine/grid';
import { segmentsKey } from '../engine/pieces';
import type { Board, PathType, Pos, Segment, Sticker } from '../engine/types';
import { drawBlock, drawBlockLife, drawEndpoint, drawLot, drawRubble, drawSticker, layerTint, paintBackdrop, roundRect } from './art';
import { PAL } from './palette';

export interface PeelAnim {
  pos: Pos;
  corner: number; // 0 TL, 1 TR, 2 BR, 3 BL
  t: number; // 0..1
}

export interface Held {
  origin: Pos;
  sticker: Sticker; // the original layer (for id / flags)
  segments: Segment[]; // current orientation
  x: number;
  y: number;
  dragging: boolean;
  rotFx: number; // visual rotation offset (radians), eases to 0
  flipFx: number; // visual flip squash, eases to 1
  since: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  life: number;
  max: number;
  color: string;
  size: number;
  kind: 'confetti' | 'spark' | 'dust';
}

interface Runner {
  type: PathType;
  pts: [number, number][];
  lens: number[];
  total: number;
  delay: number;
}

const CONFETTI = ['#f29ab0', '#f0c84a', '#7dcea0', '#8fd0e8', '#e7c6a2', '#ffffff'];

export class BoardView {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  dpr = 1;
  w = 0;
  h = 0;
  cell = 60;
  ox = 0;
  oy = 0;
  board: Board | null = null;
  /** Level id + district drive cached decor. Gameplay never reads these. */
  scene = 0;
  district = 0;

  peel: PeelAnim | null = null;
  held: Held | null = null;
  landing = new Map<number, { fx: number; fy: number; t0: number }>();
  bounce = new Map<number, number>();
  particles: Particle[] = [];
  shakeAmp = 0;
  runners: Runner[] = [];
  solveT0 = 0;
  solved = false;
  hint: { from: Pos; to: Pos; segments: Segment[]; t0: number } | null = null;
  tutorialHint: { from: Pos; to: Pos } | null = null;
  denyCell: { i: number; t0: number } | null = null;

  private cache = new Map<string, HTMLCanvasElement>();
  private decorCache = new Map<string, HTMLCanvasElement>();
  private groundCanvas: HTMLCanvasElement | null = null;
  private groundKey = '';
  private lotCanvas: HTMLCanvasElement | null = null;
  private lotKey = '';
  private spriteDpr = 0;
  private raf = 0;
  private running = false;

  setScene(levelId: number, district: number) {
    if (this.scene === levelId && this.district === district) return;
    this.scene = levelId;
    this.district = district;
    this.decorCache.clear();
    this.groundKey = '';
    this.lotKey = '';
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  setBoard(b: Board) {
    this.board = b;
    this.layout();
  }

  resize() {
    const r = this.canvas.parentElement!.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.w = Math.max(1, Math.floor(r.width));
    this.h = Math.max(1, Math.floor(r.height));
    this.canvas.width = this.w * this.dpr;
    this.canvas.height = this.h * this.dpr;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.layout();
  }

  private layout() {
    if (!this.board) return;
    const pad = 16;
    const size = Math.floor(Math.min((this.w - pad * 2) / this.board.w, (this.h - pad * 2) / this.board.h, 92));
    if (size !== this.cell || this.dpr !== this.spriteDpr) {
      this.cache.clear();
      this.decorCache.clear();
      this.groundKey = '';
      this.lotKey = '';
      this.spriteDpr = this.dpr;
    }
    this.cell = size;
    this.ox = Math.floor((this.w - size * this.board.w) / 2);
    this.oy = Math.floor((this.h - size * this.board.h) / 2);
  }

  cellAtPoint(x: number, y: number): Pos | null {
    if (!this.board) return null;
    const c = Math.floor((x - this.ox) / this.cell);
    const r = Math.floor((y - this.oy) / this.cell);
    if (r < 0 || c < 0 || r >= this.board.h || c >= this.board.w) return null;
    return { r, c };
  }

  center(p: Pos): [number, number] {
    return [this.ox + (p.c + 0.5) * this.cell, this.oy + (p.r + 0.5) * this.cell];
  }

  start() {
    if (this.running) return;
    this.running = true;
    let last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.step(dt, now);
      this.draw(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  shake(amount: number) {
    this.shakeAmp = Math.max(this.shakeAmp, amount);
  }

  burst(x: number, y: number, n = 40, kind: Particle['kind'] = 'confetti') {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = kind === 'dust' ? 40 + Math.random() * 60 : 120 + Math.random() * 260;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (kind === 'confetti' ? 180 : 20),
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 14,
        life: 0,
        max: kind === 'dust' ? 0.45 : 1.1 + Math.random() * 0.7,
        color: kind === 'dust' ? '#e6d6bf' : CONFETTI[i % CONFETTI.length],
        size: kind === 'dust' ? 3 + Math.random() * 3 : 4 + Math.random() * 5,
        kind,
      });
    }
  }

  land(target: Pos, fromX: number, fromY: number) {
    const i = idx(this.board!, target.r, target.c);
    this.landing.set(i, { fx: fromX, fy: fromY, t0: performance.now() });
    this.bounce.set(i, performance.now() + 110);
  }

  deny(p: Pos) {
    this.denyCell = { i: idx(this.board!, p.r, p.c), t0: performance.now() };
  }

  /** Start the "city comes alive" animation along each solved path (cell positions). */
  startSolve(paths: { type: PathType; cells: Pos[] }[]) {
    this.solved = true;
    this.solveT0 = performance.now();
    this.runners = paths.map((p, k) => this.makeRunner(p.type, p.cells, k * 0.25));
  }

  resetFx() {
    this.peel = null;
    this.held = null;
    this.landing.clear();
    this.bounce.clear();
    this.particles = [];
    this.runners = [];
    this.solved = false;
    this.hint = null;
    this.shakeAmp = 0;
  }

  private makeRunner(type: PathType, cells: Pos[], delay: number): Runner {
    // Edge midpoints joined by quadratic curves through each cell center, sampled densely.
    const s = this.cell;
    const pts: [number, number][] = [];
    const ctr = (p: Pos) => this.center(p);
    const mid = (a: Pos, b: Pos): [number, number] => {
      const [ax, ay] = ctr(a);
      const [bx, by] = ctr(b);
      return [(ax + bx) / 2, (ay + by) / 2];
    };
    pts.push(ctr(cells[0]));
    let prev = mid(cells[0], cells[1]);
    pts.push(prev);
    for (let i = 1; i < cells.length - 1; i++) {
      const [cx, cy] = ctr(cells[i]);
      const next = mid(cells[i], cells[i + 1]);
      for (let k = 1; k <= 10; k++) {
        const t = k / 10;
        const x = (1 - t) * (1 - t) * prev[0] + 2 * (1 - t) * t * cx + t * t * next[0];
        const y = (1 - t) * (1 - t) * prev[1] + 2 * (1 - t) * t * cy + t * t * next[1];
        pts.push([x, y]);
      }
      prev = next;
    }
    const [ex, ey] = ctr(cells[cells.length - 1]);
    pts.push([ex - (ex - prev[0]) * 0.2, ey - (ey - prev[1]) * 0.2]);
    const lens = [0];
    for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    void s;
    return { type, pts, lens, total: lens[lens.length - 1], delay };
  }

  private step(dt: number, now: number) {
    this.shakeAmp *= Math.pow(0.0015, dt);
    if (this.shakeAmp < 0.2) this.shakeAmp = 0;
    for (const p of this.particles) {
      p.life += dt;
      p.vy += (p.kind === 'confetti' ? 520 : 60) * dt;
      p.vx *= Math.pow(p.kind === 'confetti' ? 0.4 : 0.05, dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
    if (this.held) {
      this.held.rotFx *= Math.pow(0.00001, dt);
      this.held.flipFx += (1 - this.held.flipFx) * Math.min(1, dt * 18);
    }
    void now;
  }

  private stickerImage(st: Sticker, segs: Segment[]): HTMLCanvasElement {
    const s = this.cell;
    const key = `${segmentsKey(segs)}|${st.junk ? 'j' + st.id : ''}|${st.rigid ? 'R' : ''}${st.pinned ? 'P' : ''}|${s}`;
    let c = this.cache.get(key);
    if (!c) {
      c = document.createElement('canvas');
      c.width = c.height = Math.ceil(s * this.dpr);
      const g = c.getContext('2d')!;
      g.scale(this.dpr, this.dpr);
      drawSticker(g, { ...st, segments: segs }, s);
      this.cache.set(key, c);
    }
    return c;
  }

  private decor(i: number, kind: string, draw: (g: CanvasRenderingContext2D, s: number) => void): HTMLCanvasElement {
    const b = this.board;
    const key = `${this.scene}|${this.district}|${b ? b.w + 'x' + b.h : ''}|${kind}|${i}|${this.cell}|${this.dpr}`;
    let c = this.decorCache.get(key);
    if (!c) {
      c = document.createElement('canvas');
      c.width = c.height = Math.ceil(this.cell * this.dpr);
      const g = c.getContext('2d')!;
      g.scale(this.dpr, this.dpr);
      draw(g, this.cell);
      this.decorCache.set(key, c);
    }
    return c;
  }

  private groundSprite(b: Board): HTMLCanvasElement {
    const pad = 14;
    const key = `${b.w}x${b.h}|${this.cell}|${this.dpr}|${this.district}|${pad}`;
    if (this.groundCanvas && this.groundKey === key) return this.groundCanvas;
    const w = this.cell * b.w + pad * 2;
    const h = this.cell * b.h + pad * 2;
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * this.dpr);
    c.height = Math.ceil(h * this.dpr);
    const g = c.getContext('2d')!;
    g.scale(this.dpr, this.dpr);
    paintBackdrop(g, w, h, this.district, b.w, b.h, this.cell, pad);
    this.groundCanvas = c;
    this.groundKey = key;
    return c;
  }

  private lotSprite(): HTMLCanvasElement {
    const key = `${this.cell}|${this.dpr}|${this.district}`;
    if (this.lotCanvas && this.lotKey === key) return this.lotCanvas;
    const s = this.cell;
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(s * this.dpr);
    const g = c.getContext('2d')!;
    g.scale(this.dpr, this.dpr);
    drawLot(g, s, this.district);
    this.lotCanvas = c;
    this.lotKey = key;
    return c;
  }

  private draw(now: number) {
    const ctx = this.ctx;
    const b = this.board;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    if (!b) return;
    const s = this.cell;
    ctx.save();
    if (this.shakeAmp > 0) ctx.translate((Math.random() - 0.5) * this.shakeAmp * 2, (Math.random() - 0.5) * this.shakeAmp * 2);

    const pad = 14;
    const ground = this.groundSprite(b);
    ctx.drawImage(ground, this.ox - pad, this.oy - pad, s * b.w + pad * 2, s * b.h + pad * 2);

    const heldI = this.held ? idx(b, this.held.origin.r, this.held.origin.c) : -1;
    const peelI = this.peel ? idx(b, this.peel.pos.r, this.peel.pos.c) : -1;
    const pulse = 0.5 + 0.5 * Math.sin(now / 160);

    for (let r = 0; r < b.h; r++) {
      for (let c = 0; c < b.w; c++) {
        const i = idx(b, r, c);
        const cell = b.cells[i];
        const x = this.ox + c * s;
        const y = this.oy + r * s;
        if (cell.kind === 'block') {
          const seed = i + b.w * 31;
          ctx.drawImage(this.decor(i, 'block', (g, sz) => drawBlock(g, sz, seed, this.district)), x, y, s, s);
          ctx.save();
          ctx.translate(x, y);
          drawBlockLife(ctx, s, seed, now, this.district);
          ctx.restore();
          continue;
        }
        if (cell.kind === 'source' || cell.kind === 'dest') {
          const lit = this.solved;
          ctx.drawImage(this.decor(i, 'ep' + (lit ? 'L' : ''), (g, sz) => drawEndpoint(g, cell, sz, lit, this.district)), x, y, s, s);
          continue;
        }
        // ground stack
        let stack = cell.stack;
        if (i === heldI) stack = stack.slice(0, -1);
        const peeling = i === peelI;
        const visibleTopIdx = stack.length - 1;
        if (stack.length === 0 || (peeling && stack.length === 1)) {
          ctx.drawImage(this.lotSprite(), x, y, s, s);
        }
        // plates for buried layers (edge clue): peek out at the bottom edge
        const buried = peeling ? stack.length - 2 : stack.length - 1;
        for (let k = 0; k < buried; k++) {
          const depth = buried - k;
          const peek = Math.min(5, Math.max(3, s * 0.055));
          ctx.fillStyle = layerTint(stack[k]);
          roundRect(ctx, x + s * 0.07, y + s * 0.07 + depth * peek, s * 0.86, s * 0.86, s * 0.14);
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.stroke();
        }
        if (peeling && stack.length >= 2) {
          // the revealed layer under the curl
          const under = stack[stack.length - 2];
          this.drawLayerAt(under, x, y, 1);
        }
        if (visibleTopIdx < 0) {
          if (this.held && this.isValidTarget(r, c)) this.drawTargetGlow(x, y, pulse);
          continue;
        }
        const top = stack[visibleTopIdx];
        if (peeling && top.kind === 'sticker') {
          this.drawCurl(top, x, y, this.peel!);
        } else {
          const land = this.landing.get(i);
          let dx = 0;
          let dy = 0;
          if (land) {
            const t = Math.min(1, (now - land.t0) / 110);
            const e = 1 - Math.pow(1 - t, 3);
            dx = (land.fx - (x + s / 2)) * (1 - e);
            dy = (land.fy - (y + s / 2)) * (1 - e);
            if (t >= 1) this.landing.delete(i);
          }
          let scale = 1;
          const bt = this.bounce.get(i);
          if (bt !== undefined && now >= bt) {
            const t = (now - bt) / 320;
            if (t > 1) this.bounce.delete(i);
            else scale = 1 + 0.16 * Math.exp(-t * 5) * Math.cos(t * 14);
          } else if (bt !== undefined) scale = 1.12;
          let jig = 0;
          if (this.denyCell && this.denyCell.i === i) {
            const t = (now - this.denyCell.t0) / 300;
            if (t > 1) this.denyCell = null;
            else jig = Math.sin(t * 30) * 4 * (1 - t);
          }
          this.drawLayerAt(top, x + dx + jig, y + dy, scale);
        }
        if (this.held && this.isValidTarget(r, c) && i === heldI) this.drawTargetGlow(x, y, pulse, true);
      }
    }

    this.drawRunners(now);
    this.drawHint(now);
    this.drawHeld(now);

    for (const p of this.particles) {
      const a = 1 - p.life / p.max;
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.kind === 'confetti') ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  isValidTarget(r: number, c: number): boolean {
    if (!this.held || !this.board) return false;
    const o = this.held.origin;
    if (o.r === r && o.c === c) return true;
    const cell = this.board.cells[idx(this.board, r, c)];
    return cell.kind === 'ground' && cell.stack.length === 0;
  }

  private drawTargetGlow(x: number, y: number, pulse: number, origin = false) {
    const ctx = this.ctx;
    const s = this.cell;
    ctx.save();
    ctx.strokeStyle = origin ? 'rgba(125, 211, 252, 0.9)' : PAL.valid;
    ctx.lineWidth = 3 + pulse * 2;
    ctx.globalAlpha = 0.55 + pulse * 0.45;
    roundRect(ctx, x + s * 0.08, y + s * 0.08, s * 0.84, s * 0.84, s * 0.14);
    ctx.stroke();
    ctx.restore();
  }

  private drawLayerAt(l: Sticker | import('../engine/types').Layer, x: number, y: number, scale: number) {
    const ctx = this.ctx;
    const s = this.cell;
    ctx.save();
    ctx.translate(x + s / 2, y + s / 2);
    ctx.scale(scale, scale);
    ctx.translate(-s / 2, -s / 2);
    ctx.fillStyle = 'rgba(62, 42, 28, 0.22)';
    ctx.beginPath();
    ctx.ellipse(s * 0.52, s * 0.9, s * 0.34, s * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    if (l.kind === 'sticker') ctx.drawImage(this.stickerImage(l, l.segments), 0, 0, s, s);
    else ctx.drawImage(this.decor(l.id, 'rub', (g, sz) => drawRubble(g, sz, l.id)), 0, 0, s, s);
    ctx.restore();
  }

  /** The signature move: the corner curls back over the sticker like real vinyl. */
  private drawCurl(st: Sticker, x: number, y: number, p: PeelAnim) {
    const ctx = this.ctx;
    const s = this.cell;
    const a = Math.max(0.001, Math.min(0.92, p.t) * s * 0.95);
    const corners: [number, number][] = [
      [0, 0],
      [s, 0],
      [s, s],
      [0, s],
    ];
    const C = corners[p.corner];
    const ux: [number, number] = [p.corner === 0 || p.corner === 3 ? 1 : -1, 0];
    const uy: [number, number] = [0, p.corner < 2 ? 1 : -1];
    const P1: [number, number] = [C[0] + ux[0] * a, C[1]];
    const P2: [number, number] = [C[0], C[1] + uy[1] * a];
    const Cp: [number, number] = [C[0] + ux[0] * a, C[1] + uy[1] * a];
    ctx.save();
    ctx.translate(x, y);
    // remaining (still stuck) part of the sticker
    ctx.save();
    ctx.beginPath();
    const poly: [number, number][] = [];
    corners.forEach((pt, k) => {
      if (k === p.corner) {
        if (k % 2 === 0) poly.push(P2, P1);
        else poly.push(P1, P2);
      } else poly.push(pt);
    });
    poly.forEach((pt, k) => (k ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1])));
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = 'rgba(62, 42, 28, 0.2)';
    ctx.beginPath();
    ctx.ellipse(s * 0.52, s * 0.9, s * 0.34, s * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(this.stickerImage(st, st.segments), 0, 0, s, s);
    ctx.restore();
    const mid: [number, number] = [(P1[0] + P2[0]) / 2, (P1[1] + P2[1]) / 2];
    const flap = () => {
      ctx.beginPath();
      ctx.moveTo(P1[0], P1[1]);
      ctx.quadraticCurveTo((P1[0] + Cp[0]) / 2 + ux[0] * a * 0.14, (P1[1] + Cp[1]) / 2 + uy[1] * a * 0.04, Cp[0], Cp[1]);
      ctx.quadraticCurveTo((P2[0] + Cp[0]) / 2 + ux[0] * a * 0.04, (P2[1] + Cp[1]) / 2 + uy[1] * a * 0.14, P2[0], P2[1]);
      ctx.closePath();
    };
    // soft cast shadow of the rolled corner
    ctx.save();
    ctx.shadowColor = 'rgba(40, 28, 18, 0.45)';
    ctx.shadowBlur = Math.max(6, s * 0.1);
    ctx.shadowOffsetX = ux[0] * s * 0.04;
    ctx.shadowOffsetY = uy[1] * s * 0.04;
    ctx.fillStyle = 'rgba(40, 28, 18, 0.18)';
    flap();
    ctx.fill();
    ctx.restore();
    const g = ctx.createLinearGradient(mid[0], mid[1], Cp[0], Cp[1]);
    g.addColorStop(0, PAL.paperBack[1]);
    g.addColorStop(0.28, '#e4ebf2');
    g.addColorStop(0.7, PAL.paperBack[0]);
    g.addColorStop(1, '#ffffff');
    ctx.fillStyle = g;
    flap();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = Math.max(1, s * 0.02);
    flap();
    ctx.stroke();
    // the roll itself: a cylinder of paper along the crease
    ctx.lineCap = 'round';
    const roll = ctx.createLinearGradient(P1[0], P1[1], P2[0], P2[1]);
    roll.addColorStop(0, '#c5d0dc');
    roll.addColorStop(0.45, '#ffffff');
    roll.addColorStop(1, '#aeb9c8');
    ctx.strokeStyle = roll;
    ctx.lineWidth = Math.max(2, s * 0.07);
    ctx.beginPath();
    ctx.moveTo(P1[0], P1[1]);
    ctx.lineTo(P2[0], P2[1]);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = Math.max(1, s * 0.018);
    ctx.beginPath();
    ctx.moveTo(P1[0], P1[1]);
    ctx.lineTo(P2[0], P2[1]);
    ctx.stroke();
    ctx.restore();
  }

  private drawHeld(now: number) {
    const h = this.held;
    if (!h) return;
    const ctx = this.ctx;
    const s = this.cell;
    const bob = h.dragging ? 0 : Math.sin((now - h.since) / 260) * 3;
    const scale = h.dragging ? 1.14 : 1.08;
    ctx.save();
    ctx.translate(h.x, h.y + bob);
    ctx.fillStyle = 'rgba(62, 42, 28, 0.22)';
    ctx.beginPath();
    ctx.ellipse(s * 0.08, s * 0.46, s * 0.38, s * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(h.rotFx + (h.dragging ? 0.06 : 0));
    ctx.scale(scale * h.flipFx, scale);
    ctx.shadowColor = 'rgba(62, 42, 28, 0.32)';
    ctx.shadowBlur = Math.max(8, s * 0.12);
    ctx.shadowOffsetY = s * 0.08;
    ctx.shadowOffsetX = s * 0.02;
    ctx.drawImage(this.stickerImage(h.sticker, h.segments), -s / 2, -s / 2, s, s);
    ctx.restore();
  }

  private drawHint(now: number) {
    const hint = this.hint ?? (this.tutorialHint && !this.held && !this.peel ? { ...this.tutorialHint, segments: null as Segment[] | null, t0: 0 } : null);
    if (!hint) return;
    const ctx = this.ctx;
    const s = this.cell;
    const [fx, fy] = this.center(hint.from);
    const [tx, ty] = this.center(hint.to);
    if (hint.segments && this.board) {
      const st = topLayer(cellAt(this.board, hint.from));
      if (st && st.kind === 'sticker') {
        ctx.save();
        ctx.globalAlpha = 0.45 + 0.2 * Math.sin(now / 200);
        ctx.drawImage(this.stickerImage(st, hint.segments), tx - s / 2, ty - s / 2, s, s);
        ctx.restore();
      }
    }
    // finger: press, drag, release loop
    const cyc = ((now - hint.t0) % 1800) / 1800;
    const t = cyc < 0.2 ? 0 : cyc > 0.8 ? 1 : (cyc - 0.2) / 0.6;
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const x = fx + (tx - fx) * e + s * 0.12;
    const y = fy + (ty - fy) * e + s * 0.18;
    const press = cyc < 0.2 || cyc > 0.8 ? 0.9 : 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(press, press);
    ctx.globalAlpha = cyc > 0.92 ? (1 - cyc) / 0.08 : 1;
    drawFinger(ctx, s * 0.5);
    ctx.restore();
  }

  private drawRunners(now: number) {
    if (!this.runners.length) return;
    const ctx = this.ctx;
    const s = this.cell;
    const el = (now - this.solveT0) / 1000;
    for (const r of this.runners) {
      const t = Math.max(0, Math.min(1, (el - r.delay) / 1.3));
      const d = r.total * easeInOut(t);
      if (r.type === 'pipe') {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const path = () => {
          ctx.beginPath();
          r.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        };
        ctx.strokeStyle = 'rgba(14, 126, 171, 0.35)';
        ctx.lineWidth = s * 0.2;
        ctx.setLineDash([d, r.total + 10]);
        path();
        ctx.stroke();
        ctx.strokeStyle = 'rgba(160, 230, 255, 0.95)';
        ctx.lineWidth = s * 0.12;
        path();
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = s * 0.04;
        path();
        ctx.stroke();
        ctx.setLineDash([]);
        for (let i = 0; i < 3; i++) {
          const [bx, by] = pointAt(r, Math.max(0, d - i * s * 0.28));
          ctx.globalAlpha = 0.85 - i * 0.2;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(bx, by, s * (0.03 + i * 0.008), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        continue;
      }
      // a car or a tram drives along
      const [x, y, a] = pointAt(r, d);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      if (r.type === 'road') drawCar(ctx, s);
      else drawTram(ctx, s);
      ctx.restore();
    }
  }
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function pointAt(r: { pts: [number, number][]; lens: number[] }, d: number): [number, number, number] {
  let i = 1;
  while (i < r.lens.length - 1 && r.lens[i] < d) i++;
  const a = r.pts[i - 1];
  const b = r.pts[i];
  const seg = r.lens[i] - r.lens[i - 1] || 1;
  const t = Math.max(0, Math.min(1, (d - r.lens[i - 1]) / seg));
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(b[1] - a[1], b[0] - a[0])];
}

function drawCar(ctx: CanvasRenderingContext2D, s: number) {
  const L = s * 0.42;
  const Wd = s * 0.22;
  ctx.fillStyle = 'rgba(40, 28, 18, 0.28)';
  ctx.beginPath();
  ctx.ellipse(2, 4, L * 0.46, Wd * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2c2622';
  for (const [wx, wy] of [
    [-L * 0.28, -Wd * 0.55],
    [L * 0.18, -Wd * 0.55],
    [-L * 0.28, Wd * 0.55],
    [L * 0.18, Wd * 0.55],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(wx, wy, L * 0.09, Wd * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const body = ctx.createLinearGradient(0, -Wd, 0, Wd);
  body.addColorStop(0, '#ff9aab');
  body.addColorStop(1, '#e24d68');
  ctx.fillStyle = body;
  roundRect(ctx, -L / 2, -Wd / 2, L, Wd, Wd * 0.4);
  ctx.fill();
  ctx.strokeStyle = '#a8334c';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#d7f4ff';
  roundRect(ctx, -L * 0.08, -Wd * 0.34, L * 0.32, Wd * 0.68, Wd * 0.2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillRect(-L * 0.02, -Wd * 0.22, L * 0.06, Wd * 0.44);
  ctx.fillStyle = '#fff3b0';
  ctx.fillRect(L / 2 - s * 0.03, -Wd / 2 + 2, s * 0.035, s * 0.04);
  ctx.fillRect(L / 2 - s * 0.03, Wd / 2 - s * 0.055, s * 0.035, s * 0.04);
}

function drawTram(ctx: CanvasRenderingContext2D, s: number) {
  const L = s * 0.62;
  const Wd = s * 0.2;
  ctx.fillStyle = 'rgba(40, 28, 18, 0.28)';
  ctx.beginPath();
  ctx.ellipse(2, 4, L * 0.46, Wd * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2c2622';
  for (const wx of [-L * 0.32, -L * 0.05, L * 0.22]) {
    ctx.fillRect(wx, -Wd * 0.62, s * 0.04, s * 0.035);
    ctx.fillRect(wx, Wd * 0.48, s * 0.04, s * 0.035);
  }
  const body = ctx.createLinearGradient(0, -Wd, 0, Wd);
  body.addColorStop(0, '#3dbaa4');
  body.addColorStop(1, '#1c7d6c');
  ctx.fillStyle = body;
  roundRect(ctx, -L / 2, -Wd / 2, L, Wd, Wd * 0.35);
  ctx.fill();
  ctx.strokeStyle = '#145e52';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#e8b84a';
  ctx.fillRect(-L / 2, -s * 0.012, L, s * 0.025);
  ctx.fillStyle = '#fff6d8';
  for (let i = 0; i < 4; i++) ctx.fillRect(-L / 2 + L * (0.1 + i * 0.2), -Wd * 0.28, L * 0.12, Wd * 0.56);
  ctx.strokeStyle = '#145e52';
  ctx.lineWidth = Math.max(1, s * 0.015);
  ctx.beginPath();
  ctx.moveTo(0, -Wd * 0.5);
  ctx.lineTo(0, -Wd * 1.15);
  ctx.moveTo(-L * 0.12, -Wd * 1.05);
  ctx.lineTo(L * 0.12, -Wd * 1.05);
  ctx.stroke();
  ctx.fillStyle = '#fff3b0';
  ctx.fillRect(L / 2 - s * 0.04, -s * 0.02, s * 0.03, s * 0.04);
}

function drawFinger(ctx: CanvasRenderingContext2D, s: number) {
  ctx.fillStyle = 'rgba(50, 32, 20, 0.22)';
  ctx.beginPath();
  ctx.ellipse(s * 0.08, s * 0.72, s * 0.28, s * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  const skin = '#f6c7a8';
  const line = '#6a4638';
  ctx.fillStyle = skin;
  ctx.strokeStyle = line;
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  roundRect(ctx, -s * 0.1, -s * 0.48, s * 0.22, s * 0.58, s * 0.1);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffe4d4';
  roundRect(ctx, -s * 0.055, -s * 0.44, s * 0.13, s * 0.11, s * 0.05);
  ctx.fill();
  ctx.fillStyle = skin;
  roundRect(ctx, -s * 0.16, 0, s * 0.48, s * 0.46, s * 0.16);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(s * 0.22, s * 0.12, s * 0.09, s * 0.13, 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(232, 90, 110, 0.55)';
  ctx.beginPath();
  ctx.arc(0, -s * 0.52, s * 0.12 + Math.sin(performance.now() / 140) * 1.4, 0, Math.PI * 2);
  ctx.globalAlpha *= 0.7;
  ctx.fill();
}
