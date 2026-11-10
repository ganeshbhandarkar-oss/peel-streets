import { maskFor } from '../engine/pieces';
import { E, N, S, W, type Cell, type Layer, type PathType, type Segment, type Sticker } from '../engine/types';
import { PAL, themeFor, type DistrictTheme } from './palette';

type Ctx = CanvasRenderingContext2D;

/**
 * Afternoon Diorama.
 * Chunk shapes, warm light from the upper left, contact shadows, a thin outline and a light rim.
 * Roads, rails and pipes keep fixed colors and patterns so a connection is obvious on any district.
 */

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

const DIR_VEC: Record<number, [number, number]> = { [N]: [0, -1], [E]: [1, 0], [S]: [0, 1], [W]: [-1, 0] };
const ALL = [N, E, S, W];
const bits = (m: number) => ALL.filter((d) => m & d);

function cornerOf(mask: number): [number, number] | null {
  const b = bits(mask);
  if (b.length !== 2) return null;
  const [a, c] = b;
  if ((a | c) === (N | S) || (a | c) === (E | W)) return null;
  const v1 = DIR_VEC[a];
  const v2 = DIR_VEC[c];
  return [0.5 + 0.5 * (v1[0] + v2[0]), 0.5 + 0.5 * (v1[1] + v2[1])];
}

function traceArms(ctx: Ctx, mask: number, s: number) {
  ctx.beginPath();
  const corner = cornerOf(mask);
  if (corner) {
    const [cx, cy] = corner;
    const ang = (x: number, y: number) => Math.atan2(y - cy, x - cx);
    const b = bits(mask).map((d) => [0.5 + DIR_VEC[d][0] * 0.5, 0.5 + DIR_VEC[d][1] * 0.5]);
    let a0 = ang(b[0][0], b[0][1]);
    let a1 = ang(b[1][0], b[1][1]);
    let diff = a1 - a0;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    ctx.arc(cx * s, cy * s, s / 2, a0, a0 + diff, diff < 0);
    return;
  }
  const bs = bits(mask);
  if (bs.length === 1) {
    const [dx, dy] = DIR_VEC[bs[0]];
    ctx.moveTo(s / 2, s / 2);
    ctx.lineTo(s / 2 + (dx * s) / 2, s / 2 + (dy * s) / 2);
    return;
  }
  for (const d of bs) {
    const [dx, dy] = DIR_VEC[d];
    ctx.moveTo(s / 2, s / 2);
    ctx.lineTo(s / 2 + (dx * s) / 2, s / 2 + (dy * s) / 2);
  }
}

function deadEndCap(ctx: Ctx, mask: number, s: number, color: string, r: number) {
  if (bits(mask).length !== 1) return;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, r, 0, Math.PI * 2);
  ctx.fill();
}

interface Sample {
  x: number;
  y: number;
  tx: number;
  ty: number;
}

/** Centerline chains from the middle of the tile out to each opening (one smooth chain for a corner). */
function chainsOf(mask: number, s: number): Sample[][] {
  const step = Math.max(4, s * 0.08);
  const corner = cornerOf(mask);
  if (corner) {
    const [cx, cy] = corner;
    const b = bits(mask).map((d) => [0.5 + DIR_VEC[d][0] * 0.5, 0.5 + DIR_VEC[d][1] * 0.5] as const);
    let a0 = Math.atan2(b[0][1] - cy, b[0][0] - cx);
    let a1 = Math.atan2(b[1][1] - cy, b[1][0] - cx);
    let diff = a1 - a0;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const len = Math.abs(diff) * (s / 2);
    const n = Math.max(4, Math.round(len / step));
    const dir = diff >= 0 ? 1 : -1;
    const chain: Sample[] = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + diff * (i / n);
      chain.push({
        x: cx * s + Math.cos(a) * (s / 2),
        y: cy * s + Math.sin(a) * (s / 2),
        tx: -Math.sin(a) * dir,
        ty: Math.cos(a) * dir,
      });
    }
    return [chain];
  }
  const out: Sample[][] = [];
  for (const d of bits(mask)) {
    const [dx, dy] = DIR_VEC[d];
    const len = s / 2;
    const n = Math.max(2, Math.round(len / step));
    const chain: Sample[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      chain.push({ x: s / 2 + dx * len * t, y: s / 2 + dy * len * t, tx: dx, ty: dy });
    }
    out.push(chain);
  }
  return out;
}

function strokeChain(ctx: Ctx, chain: Sample[], width: number, color: string, offset = 0) {
  if (chain.length < 2) return;
  ctx.beginPath();
  for (let i = 0; i < chain.length; i++) {
    const p = chain[i];
    const x = p.x - p.ty * offset;
    const y = p.y + p.tx * offset;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

export function drawRoad(ctx: Ctx, mask: number, s: number) {
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  traceArms(ctx, mask, s);
  ctx.strokeStyle = PAL.roadEdge;
  ctx.lineWidth = s * 0.46;
  ctx.stroke();
  traceArms(ctx, mask, s);
  ctx.strokeStyle = PAL.road;
  ctx.lineWidth = s * 0.38;
  ctx.stroke();
  traceArms(ctx, mask, s);
  ctx.setLineDash([s * 0.09, s * 0.08]);
  ctx.strokeStyle = PAL.roadLine;
  ctx.lineWidth = s * 0.045;
  ctx.stroke();
  ctx.setLineDash([]);
  if (bits(mask).length >= 3) {
    ctx.fillStyle = PAL.road;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PAL.roadEdge;
    ctx.lineWidth = s * 0.028;
    ctx.stroke();
    ctx.fillStyle = PAL.roadHi;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.045, 0, Math.PI * 2);
    ctx.fill();
  }
  deadEndCap(ctx, mask, s, PAL.roadLine, s * 0.07);
}

export function drawRail(ctx: Ctx, mask: number, s: number) {
  const chains = chainsOf(mask, s);
  for (const c of chains) strokeChain(ctx, c, s * 0.42, PAL.railBedEdge);
  for (const c of chains) strokeChain(ctx, c, s * 0.34, PAL.railBed);
  if (bits(mask).length >= 3) {
    ctx.fillStyle = PAL.railBed;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PAL.railBedEdge;
    ctx.lineWidth = s * 0.035;
    ctx.stroke();
  }
  ctx.fillStyle = PAL.railTie;
  for (const c of chains) {
    for (let i = 2; i < c.length - 1; i += 3) {
      const p = c[i];
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.atan2(p.ty, p.tx));
      ctx.fillRect(-s * 0.03, -s * 0.18, s * 0.06, s * 0.36);
      ctx.restore();
    }
  }
  const o = s * 0.09;
  for (const c of chains) {
    for (const sg of [-1, 1]) {
      strokeChain(ctx, c, s * 0.05, PAL.railSteelDark, o * sg);
      strokeChain(ctx, c, s * 0.026, PAL.railSteel, o * sg);
    }
  }
  deadEndCap(ctx, mask, s, PAL.railTie, s * 0.12);
}

export function drawPipe(ctx: Ctx, mask: number, s: number) {
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  traceArms(ctx, mask, s);
  ctx.strokeStyle = PAL.pipeDark;
  ctx.lineWidth = s * 0.3;
  ctx.stroke();
  traceArms(ctx, mask, s);
  ctx.strokeStyle = PAL.pipe;
  ctx.lineWidth = s * 0.22;
  ctx.stroke();
  traceArms(ctx, mask, s);
  ctx.strokeStyle = PAL.pipeHi;
  ctx.lineWidth = s * 0.055;
  ctx.stroke();
  ctx.fillStyle = PAL.pipeDark;
  for (const d of bits(mask)) {
    const [dx, dy] = DIR_VEC[d];
    const cx = s / 2 + dx * s * 0.4;
    const cy = s / 2 + dy * s * 0.4;
    ctx.save();
    ctx.translate(cx, cy);
    if (dx) roundRect(ctx, -s * 0.03, -s * 0.16, s * 0.06, s * 0.32, s * 0.02);
    else roundRect(ctx, -s * 0.16, -s * 0.03, s * 0.32, s * 0.06, s * 0.02);
    ctx.fill();
    ctx.fillStyle = PAL.pipeHi;
    if (dx) ctx.fillRect(-s * 0.03, -s * 0.16, s * 0.02, s * 0.32);
    else ctx.fillRect(-s * 0.16, -s * 0.03, s * 0.32, s * 0.02);
    ctx.restore();
    ctx.fillStyle = PAL.pipeDark;
  }
  if (bits(mask).length >= 3) {
    ctx.fillStyle = PAL.pipeDark;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAL.pipe;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAL.pipeHi;
    ctx.beginPath();
    ctx.arc(s / 2 - s * 0.03, s / 2 - s * 0.03, s * 0.04, 0, Math.PI * 2);
    ctx.fill();
  }
  deadEndCap(ctx, mask, s, PAL.pipeDark, s * 0.12);
}

const DRAW: Record<PathType, (ctx: Ctx, m: number, s: number) => void> = { road: drawRoad, rail: drawRail, pipe: drawPipe };

export function drawSegments(ctx: Ctx, segs: Segment[], s: number) {
  const order: PathType[] = ['pipe', 'rail', 'road'];
  const present = order.filter((t) => maskFor(segs, t));
  present.forEach((t, i) => {
    if (i > 0) {
      ctx.save();
      ctx.shadowColor = 'rgba(40, 28, 18, 0.28)';
      ctx.shadowBlur = s * 0.05;
      ctx.shadowOffsetY = s * 0.025;
      DRAW[t](ctx, maskFor(segs, t), s);
      ctx.restore();
    } else DRAW[t](ctx, maskFor(segs, t), s);
  });
}

/** Mix a seed into uncorrelated 0..1 values. A linear LCG made neighbouring tiles repeat. */
function rand(seed: number) {
  let x = Math.imul(Math.floor(Math.abs(seed)) + 1, 0x9e3779b1) >>> 0;
  return () => {
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    x = (x ^ (x >>> 16)) >>> 0;
    return x / 4294967296;
  };
}

export function drawSticker(ctx: Ctx, st: Sticker, s: number) {
  const inset = s * 0.038;
  const r = s * 0.16;
  ctx.save();
  roundRect(ctx, inset, inset, s - inset * 2, s - inset * 2, r);
  const g = ctx.createLinearGradient(0, 0, s, s);
  if (st.junk) {
    g.addColorStop(0, '#ffd5e0');
    g.addColorStop(1, '#f08aa4');
  } else {
    g.addColorStop(0, '#fffefb');
    g.addColorStop(0.55, '#fff6ec');
    g.addColorStop(1, '#f1e4d2');
  }
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.ellipse(s * 0.34, s * 0.22, s * 0.3, s * 0.13, -0.6, 0, Math.PI * 2);
  ctx.fill();
  const spec = rand(st.junk ? st.id + 1 : 11);
  ctx.fillStyle = st.junk ? 'rgba(255,255,255,0.16)' : 'rgba(120, 80, 40, 0.045)';
  for (let i = 0; i < 12; i++) ctx.fillRect(spec() * s, spec() * s, s * 0.045, s * 0.012);
  if (st.junk) drawJunk(ctx, s, st.id);
  else drawSegments(ctx, st.segments, s);
  ctx.restore();
  roundRect(ctx, inset, inset, s - inset * 2, s - inset * 2, r);
  ctx.lineWidth = Math.max(1, s * 0.026);
  ctx.strokeStyle = st.junk ? PAL.junkDark : PAL.paperEdge;
  ctx.stroke();
  ctx.restore();
  if (st.rigid) drawRigid(ctx, s);
  if (st.pinned) drawPin(ctx, s * 0.2, s * 0.2, s * 0.085);
}

function drawRigid(ctx: Ctx, s: number) {
  const inset = s * 0.04;
  const r = s * 0.16;
  ctx.save();
  roundRect(ctx, inset, inset, s - inset * 2, s - inset * 2, r);
  ctx.lineWidth = s * 0.07;
  ctx.strokeStyle = PAL.rigid;
  ctx.setLineDash([s * 0.07, s * 0.048]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = Math.max(1, s * 0.018);
  ctx.strokeStyle = PAL.rigidDark;
  ctx.stroke();
  const pts: [number, number][] = [
    [inset + s * 0.08, inset + s * 0.08],
    [s - inset - s * 0.08, inset + s * 0.08],
    [s - inset - s * 0.08, s - inset - s * 0.08],
    [inset + s * 0.08, s - inset - s * 0.08],
  ];
  for (const [x, y] of pts) {
    ctx.fillStyle = '#fff6d8';
    ctx.beginPath();
    ctx.arc(x, y, s * 0.028, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PAL.rigidDark;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

export function drawPin(ctx: Ctx, x: number, y: number, r: number) {
  ctx.save();
  ctx.strokeStyle = '#8d939c';
  ctx.lineWidth = Math.max(1, r * 0.28);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + r * 0.1, y + r * 0.2);
  ctx.lineTo(x + r * 0.95, y + r * 1.35);
  ctx.stroke();
  ctx.fillStyle = 'rgba(40,20,20,0.25)';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.35, y + r * 0.55, r, r * 0.55, 0.4, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, '#ffd0d8');
  g.addColorStop(0.55, PAL.pin);
  g.addColorStop(1, '#b4233c');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(x - r * 0.28, y - r * 0.32, r * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawJunk(ctx: Ctx, s: number, seed: number) {
  const rnd = rand(seed + 7);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = s * 0.045;
  for (let i = -1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(i * s * 0.28, s * 0.08);
    ctx.lineTo(i * s * 0.28 + s * 0.7, s * 0.92);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(168, 67, 96, 0.35)';
  ctx.beginPath();
  ctx.moveTo(s * 0.2, s * 0.62);
  ctx.lineTo(s * 0.48, s * 0.28);
  ctx.lineTo(s * 0.78, s * 0.58);
  ctx.lineTo(s * 0.5, s * 0.78);
  ctx.closePath();
  ctx.fill();
  const cols = ['#fff3c4', '#c8f1ff', '#e7ffd4', '#ffffff'];
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = cols[i % cols.length];
    ctx.beginPath();
    ctx.arc(s * (0.18 + rnd() * 0.64), s * (0.18 + rnd() * 0.64), s * (0.028 + rnd() * 0.03), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = PAL.junkDeep;
  ctx.lineWidth = s * 0.03;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(s * 0.26, s * 0.66);
  ctx.lineTo(s * 0.38, s * 0.46);
  ctx.lineTo(s * 0.5, s * 0.64);
  ctx.lineTo(s * 0.64, s * 0.42);
  ctx.lineTo(s * 0.76, s * 0.62);
  ctx.stroke();
}

export function drawRubble(ctx: Ctx, s: number, seed: number) {
  const rnd = rand(seed + 3);
  roundRect(ctx, s * 0.05, s * 0.05, s * 0.9, s * 0.9, s * 0.16);
  const g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, '#cfc6bb');
  g.addColorStop(1, '#a79e94');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.fillStyle = 'rgba(60,40,30,0.12)';
  ctx.beginPath();
  ctx.ellipse(s * 0.5, s * 0.78, s * 0.32, s * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 6; i++) {
    const x = s * (0.22 + rnd() * 0.56);
    const y = s * (0.24 + rnd() * 0.5);
    const rx = s * (0.07 + rnd() * 0.07);
    const ry = s * (0.05 + rnd() * 0.04);
    ctx.fillStyle = 'rgba(60,40,30,0.18)';
    ctx.beginPath();
    ctx.ellipse(x + s * 0.015, y + s * 0.02, rx, ry, rnd(), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = i % 2 ? PAL.rubbleDark : PAL.rubbleHi;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rnd(), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(x - rx * 0.25, y - ry * 0.3, rx * 0.35, ry * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#6a5344';
  ctx.lineWidth = s * 0.045;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(s * 0.18, s * 0.7);
  ctx.lineTo(s * 0.78, s * 0.58);
  ctx.stroke();
  ctx.strokeStyle = PAL.rubbleDark;
  ctx.lineWidth = s * 0.02;
  ctx.beginPath();
  ctx.moveTo(s * 0.2, s * 0.32);
  ctx.lineTo(s * 0.46, s * 0.48);
  ctx.lineTo(s * 0.38, s * 0.7);
  ctx.moveTo(s * 0.46, s * 0.48);
  ctx.lineTo(s * 0.78, s * 0.36);
  ctx.stroke();
}

export function layerTint(l: Layer): string {
  if (l.kind === 'rubble') return PAL.rubbleDark;
  if (l.junk) return PAL.junkDark;
  const t = l.segments[0]?.type ?? 'road';
  return t === 'road' ? PAL.road : t === 'rail' ? PAL.railTie : PAL.pipe;
}

export function drawLayer(ctx: Ctx, l: Layer, s: number) {
  if (l.kind === 'rubble') drawRubble(ctx, s, l.id);
  else drawSticker(ctx, l, s);
}

export function drawLot(ctx: Ctx, s: number, district = 0) {
  const th = themeFor(district);
  drawPad(ctx, s, th, true);
  roundRect(ctx, s * 0.16, s * 0.16, s * 0.68, s * 0.68, s * 0.12);
  ctx.setLineDash([s * 0.07, s * 0.055]);
  ctx.lineWidth = Math.max(1.25, s * 0.03);
  ctx.strokeStyle = '#a67c52';
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(120, 80, 40, 0.16)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(s * 0.5, s * 0.24);
  ctx.lineTo(s * 0.5, s * 0.76);
  ctx.moveTo(s * 0.24, s * 0.5);
  ctx.lineTo(s * 0.76, s * 0.5);
  ctx.stroke();
}

function drawPad(ctx: Ctx, s: number, th: DistrictTheme, stone: boolean) {
  ctx.fillStyle = 'rgba(62, 42, 28, 0.1)';
  roundRect(ctx, s * 0.055, s * 0.07, s * 0.92, s * 0.9, s * 0.18);
  ctx.fill();
  const g = ctx.createLinearGradient(0, s * 0.04, 0, s);
  g.addColorStop(0, stone ? '#f8f3eb' : th.grass);
  g.addColorStop(1, stone ? th.stone : th.grassDark);
  ctx.fillStyle = g;
  roundRect(ctx, s * 0.04, s * 0.04, s * 0.92, s * 0.9, s * 0.18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = stone ? th.stoneDark : '#e6d7c4';
  roundRect(ctx, s * 0.12, s * 0.8, s * 0.76, s * 0.09, s * 0.04);
  ctx.fill();
}

function contact(ctx: Ctx, x: number, y: number, rx: number, ry: number) {
  ctx.fillStyle = 'rgba(62, 42, 28, 0.2)';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
type Species = 'oak' | 'pine' | 'palm' | 'bloom';
interface Tree {
  x: number;
  y: number;
  r: number;
  sp: Species;
}
type Kind = 'park' | 'house' | 'shop' | 'tower' | 'factory' | 'station';
interface Plan {
  kind: Kind;
  wall: number;
  doorLeft: boolean;
  windows: Rect[];
  steam: { x: number; y: number } | null;
  trees: Tree[];
  pond: boolean;
  stall: boolean;
  lamp: { x: number; y: number } | null;
  flower: boolean;
}

function pickKind(r: number, district: number): Kind {
  if (district === 0) {
    if (r < 0.36) return 'park';
    if (r < 0.62) return 'house';
    if (r < 0.78) return 'shop';
    if (r < 0.9) return 'station';
    return 'factory';
  }
  if (district === 1) {
    if (r < 0.26) return 'park';
    if (r < 0.4) return 'house';
    if (r < 0.68) return 'shop';
    if (r < 0.8) return 'factory';
    if (r < 0.92) return 'tower';
    return 'station';
  }
  if (r < 0.32) return 'park';
  if (r < 0.5) return 'tower';
  if (r < 0.64) return 'house';
  if (r < 0.76) return 'station';
  if (r < 0.88) return 'shop';
  return 'factory';
}

function speciesOf(n: number, district: number): Species {
  const table: Species[][] = [
    ['palm', 'oak', 'oak', 'pine'],
    ['bloom', 'oak', 'pine', 'oak'],
    ['oak', 'pine', 'pine', 'bloom'],
  ];
  return table[district % 3][n % 4];
}

function houseLayout(s: number, doorLeft: boolean) {
  const x = s * 0.16;
  const y = s * 0.4;
  const w = s * 0.58;
  const h = s * 0.42;
  const wins: Rect[] = [
    { x: x + w * 0.1, y: y + h * 0.16, w: s * 0.11, h: s * 0.09 },
    { x: x + w * 0.55, y: y + h * 0.16, w: s * 0.11, h: s * 0.09 },
  ];
  const door: Rect = {
    x: doorLeft ? x + s * 0.08 : x + w - s * 0.2,
    y: y + h - s * 0.16,
    w: s * 0.12,
    h: s * 0.16,
  };
  return { x, y, w, h, wins, door, steam: { x: x + w * 0.76, y: y - s * 0.2 } };
}

function shopLayout(s: number) {
  const x = s * 0.12;
  const y = s * 0.4;
  const w = s * 0.66;
  const h = s * 0.42;
  const wins: Rect[] = [{ x: x + s * 0.08, y: y + s * 0.15, w: s * 0.28, h: s * 0.15 }];
  const door: Rect = { x: x + w - s * 0.2, y: y + h - s * 0.18, w: s * 0.13, h: s * 0.18 };
  return { x, y, w, h, wins, door };
}

function towerLayout(s: number) {
  const x = s * 0.3;
  const y = s * 0.18;
  const w = s * 0.32;
  const h = s * 0.64;
  const wins: Rect[] = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 2; c++) wins.push({ x: x + s * 0.045 + c * s * 0.13, y: y + s * 0.07 + r * s * 0.13, w: s * 0.075, h: s * 0.065 });
  }
  wins.push({ x: x + w * 0.4, y: y - s * 0.08, w: s * 0.04, h: s * 0.04 });
  return { x, y, w, h, wins };
}

function factoryLayout(s: number) {
  const x = s * 0.1;
  const y = s * 0.46;
  const w = s * 0.64;
  const h = s * 0.36;
  const stack = { x: x + w - s * 0.02, y: s * 0.16, w: s * 0.1, h: y - s * 0.16 };
  const wins: Rect[] = [
    { x: x + s * 0.08, y: y + s * 0.06, w: s * 0.1, h: s * 0.07 },
    { x: x + s * 0.22, y: y + s * 0.06, w: s * 0.1, h: s * 0.07 },
  ];
  const door: Rect = { x: x + s * 0.08, y: y + h - s * 0.16, w: s * 0.22, h: s * 0.16 };
  return { x, y, w, h, stack, steam: { x: stack.x + stack.w / 2, y: stack.y }, wins, door };
}

function stationLayout(s: number) {
  const x = s * 0.1;
  const y = s * 0.42;
  const w = s * 0.72;
  const h = s * 0.4;
  const wins: Rect[] = [
    { x: x + s * 0.12, y: y + s * 0.14, w: s * 0.1, h: s * 0.09 },
    { x: x + w - s * 0.24, y: y + s * 0.14, w: s * 0.1, h: s * 0.09 },
  ];
  return { x, y, w, h, wins };
}

function blockPlan(seed: number, s: number, district: number): Plan {
  const rnd = rand(seed * 13 + 5);
  const kind = pickKind(rnd(), district);
  const wall = Math.floor(rnd() * 3);
  const doorLeft = rnd() < 0.5;
  let windows: Rect[] = [];
  let steam: { x: number; y: number } | null = null;
  const trees: Tree[] = [];
  let pond = false;
  let stall = false;
  if (kind === 'house') {
    const g = houseLayout(s, doorLeft);
    windows = g.wins;
    if (rnd() < 0.75) steam = g.steam;
  } else if (kind === 'shop') windows = shopLayout(s).wins;
  else if (kind === 'tower') windows = towerLayout(s).wins;
  else if (kind === 'factory') {
    const g = factoryLayout(s);
    windows = g.wins;
    steam = g.steam;
  } else if (kind === 'station') windows = stationLayout(s).wins;
  else {
    pond = district === 0 && rnd() < 0.38;
    stall = district === 1 && !pond && rnd() < 0.42;
    const spots = stall || pond ? [[0.26, 0.34], [0.74, 0.36]] : [[0.3, 0.36], [0.68, 0.4], [0.46, 0.66]];
    const n = stall || pond ? 2 : 2 + Math.floor(rnd() * 2);
    for (let i = 0; i < n && i < spots.length; i++) {
      const sp = speciesOf(Math.floor(rnd() * 4), district);
      const jx = (rnd() - 0.5) * 0.06;
      const jy = (rnd() - 0.5) * 0.05;
      trees.push({
        x: s * (spots[i][0] + jx),
        y: s * (spots[i][1] + jy),
        r: s * (sp === 'pine' ? 0.15 : sp === 'palm' ? 0.14 : 0.13 + rnd() * 0.035),
        sp,
      });
    }
  }
  const lamp = kind !== 'park' && rnd() < 0.55 ? { x: s * 0.14, y: s * 0.76 } : null;
  return { kind, wall, doorLeft, windows, steam, trees, pond, stall, lamp, flower: rnd() < 0.85 };
}

function inkStroke(ctx: Ctx, s: number) {
  ctx.strokeStyle = 'rgba(48, 32, 24, 0.45)';
  ctx.lineWidth = Math.max(1, s * 0.016);
  ctx.stroke();
}

function drawWindow(ctx: Ctx, s: number, w: Rect, th: DistrictTheme) {
  ctx.fillStyle = th.ink;
  roundRect(ctx, w.x - s * 0.01, w.y - s * 0.01, w.w + s * 0.02, w.h + s * 0.02, s * 0.015);
  ctx.fill();
  ctx.fillStyle = '#b7c9d8';
  ctx.fillRect(w.x, w.y, w.w, w.h);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillRect(w.x, w.y, w.w * 0.32, w.h);
  ctx.strokeStyle = 'rgba(40, 50, 60, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w.x + w.w / 2, w.y);
  ctx.lineTo(w.x + w.w / 2, w.y + w.h);
  ctx.moveTo(w.x, w.y + w.h / 2);
  ctx.lineTo(w.x + w.w, w.y + w.h / 2);
  ctx.stroke();
}

function drawDoor(ctx: Ctx, s: number, d: Rect, th: DistrictTheme) {
  ctx.fillStyle = th.ink;
  roundRect(ctx, d.x, d.y, d.w, d.h, s * 0.02);
  ctx.fill();
  ctx.fillStyle = '#f0c14a';
  ctx.beginPath();
  ctx.arc(d.x + d.w * 0.72, d.y + d.h * 0.55, Math.max(1, s * 0.012), 0, Math.PI * 2);
  ctx.fill();
}

function bushes(ctx: Ctx, x: number, y: number, s: number, th: DistrictTheme) {
  ctx.fillStyle = th.leafDark;
  ctx.beginPath();
  ctx.ellipse(x, y, s * 0.055, s * 0.03, 0, 0, Math.PI * 2);
  ctx.ellipse(x + s * 0.06, y + s * 0.008, s * 0.04, s * 0.024, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = th.leaf;
  ctx.beginPath();
  ctx.ellipse(x + s * 0.02, y - s * 0.01, s * 0.04, s * 0.024, 0, 0, Math.PI * 2);
  ctx.fill();
}

function sideFace(ctx: Ctx, x: number, y: number, w: number, h: number, s: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + w, y + s * 0.03);
  ctx.lineTo(x + w + s * 0.09, y + s * 0.09);
  ctx.lineTo(x + w + s * 0.09, y + h + s * 0.04);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
}

function drawHouse(ctx: Ctx, s: number, th: DistrictTheme, plan: Plan) {
  const L = houseLayout(s, plan.doorLeft);
  const wall = th.wall[plan.wall];
  const side = th.wallSide[plan.wall];
  const roof = th.roof[plan.wall];
  const roofD = th.roofDark[plan.wall];
  contact(ctx, L.x + L.w * 0.55, L.y + L.h + s * 0.02, L.w * 0.52, s * 0.06);
  sideFace(ctx, L.x, L.y, L.w, L.h, s, side);
  ctx.fillStyle = wall;
  roundRect(ctx, L.x, L.y, L.w, L.h, s * 0.03);
  ctx.fill();
  inkStroke(ctx, s);
  ctx.fillStyle = roof;
  ctx.beginPath();
  ctx.moveTo(L.x - s * 0.04, L.y + s * 0.03);
  ctx.lineTo(L.x + L.w * 0.48, L.y - s * 0.2);
  ctx.lineTo(L.x + L.w + s * 0.06, L.y + s * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = roofD;
  ctx.lineWidth = Math.max(1, s * 0.016);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = s * 0.02;
  ctx.beginPath();
  ctx.moveTo(L.x + s * 0.02, L.y);
  ctx.lineTo(L.x + L.w * 0.46, L.y - s * 0.15);
  ctx.stroke();
  const eg = ctx.createLinearGradient(0, L.y, 0, L.y + s * 0.1);
  eg.addColorStop(0, 'rgba(50,30,20,0.22)');
  eg.addColorStop(1, 'rgba(50,30,20,0)');
  ctx.fillStyle = eg;
  ctx.fillRect(L.x, L.y, L.w, s * 0.1);
  ctx.fillStyle = roofD;
  ctx.fillRect(L.x + L.w * 0.7, L.y - s * 0.16, s * 0.07, s * 0.18);
  ctx.fillStyle = '#5c564e';
  ctx.fillRect(L.x + L.w * 0.68, L.y - s * 0.19, s * 0.1, s * 0.04);
  drawDoor(ctx, s, L.door, th);
  for (const w of L.wins) drawWindow(ctx, s, w, th);
  bushes(ctx, L.x + s * 0.02, L.y + L.h, s, th);
  bushes(ctx, L.x + L.w - s * 0.06, L.y + L.h, s, th);
  if (plan.flower) {
    ctx.fillStyle = th.bloom;
    ctx.beginPath();
    ctx.arc(L.x + s * 0.04, L.y + L.h + s * 0.02, s * 0.018, 0, Math.PI * 2);
    ctx.arc(L.x + L.w, L.y + L.h + s * 0.015, s * 0.016, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawShop(ctx: Ctx, s: number, th: DistrictTheme, plan: Plan) {
  const L = shopLayout(s);
  const wall = th.wall[plan.wall];
  const side = th.wallSide[plan.wall];
  contact(ctx, L.x + L.w * 0.5, L.y + L.h + s * 0.015, L.w * 0.48, s * 0.055);
  sideFace(ctx, L.x, L.y, L.w, L.h, s, side);
  ctx.fillStyle = wall;
  roundRect(ctx, L.x, L.y, L.w, L.h, s * 0.03);
  ctx.fill();
  inkStroke(ctx, s);
  ctx.fillStyle = th.roof[plan.wall];
  roundRect(ctx, L.x - s * 0.02, L.y - s * 0.04, L.w + s * 0.06, s * 0.07, s * 0.02);
  ctx.fill();
  const stripes = 7;
  const awY = L.y + s * 0.05;
  const awH = s * 0.1;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 ? th.awning[0] : th.awning[1];
    ctx.fillRect(L.x + (L.w / stripes) * i, awY, L.w / stripes + 0.6, awH);
  }
  ctx.fillStyle = th.awning[0];
  for (let i = 0; i < stripes; i++) {
    ctx.beginPath();
    ctx.arc(L.x + (L.w / stripes) * (i + 0.5), awY + awH, L.w / stripes / 2, 0, Math.PI);
    ctx.fill();
  }
  for (const w of L.wins) drawWindow(ctx, s, w, th);
  drawDoor(ctx, s, L.door, th);
  ctx.fillStyle = th.trim;
  roundRect(ctx, L.x + s * 0.08, L.y - s * 0.12, s * 0.16, s * 0.08, s * 0.015);
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,24,16,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  bushes(ctx, L.x + s * 0.02, L.y + L.h, s, th);
}

function drawTower(ctx: Ctx, s: number, th: DistrictTheme, plan: Plan) {
  const L = towerLayout(s);
  const wall = th.wall[plan.wall];
  const side = th.wallSide[plan.wall];
  contact(ctx, L.x + L.w * 0.55, L.y + L.h + s * 0.02, L.w * 0.6, s * 0.06);
  sideFace(ctx, L.x, L.y, L.w, L.h, s, side);
  const g = ctx.createLinearGradient(L.x, 0, L.x + L.w, 0);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.3, wall);
  g.addColorStop(1, side);
  ctx.fillStyle = g;
  roundRect(ctx, L.x, L.y, L.w, L.h, s * 0.02);
  ctx.fill();
  inkStroke(ctx, s);
  ctx.fillStyle = th.roof[plan.wall];
  roundRect(ctx, L.x - s * 0.02, L.y - s * 0.03, L.w + s * 0.08, s * 0.06, s * 0.015);
  ctx.fill();
  ctx.fillStyle = th.roofDark[plan.wall];
  ctx.fillRect(L.x + L.w * 0.38, L.y - s * 0.14, s * 0.045, s * 0.12);
  ctx.strokeStyle = th.ink;
  ctx.lineWidth = Math.max(1, s * 0.015);
  ctx.beginPath();
  ctx.moveTo(L.x + L.w * 0.4, L.y - s * 0.14);
  ctx.lineTo(L.x + L.w * 0.4, L.y - s * 0.22);
  ctx.stroke();
  for (const w of L.wins) drawWindow(ctx, s, w, th);
}

function drawFactory(ctx: Ctx, s: number, th: DistrictTheme, plan: Plan) {
  const L = factoryLayout(s);
  contact(ctx, L.x + L.w * 0.45, L.y + L.h, L.w * 0.5, s * 0.055);
  ctx.fillStyle = th.wallSide[plan.wall];
  roundRect(ctx, L.x + s * 0.05, L.y + s * 0.04, L.w, L.h, s * 0.02);
  ctx.fill();
  ctx.fillStyle = '#c46a4a';
  roundRect(ctx, L.x, L.y, L.w, L.h, s * 0.02);
  ctx.fill();
  inkStroke(ctx, s);
  ctx.strokeStyle = 'rgba(90, 30, 20, 0.25)';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(L.x + s * 0.04, L.y + (L.h / 4) * i);
    ctx.lineTo(L.x + L.w - s * 0.04, L.y + (L.h / 4) * i);
    ctx.stroke();
  }
  ctx.fillStyle = th.roofDark[1];
  ctx.fillRect(L.x - s * 0.01, L.y - s * 0.03, L.w + s * 0.02, s * 0.05);
  ctx.fillStyle = '#8d8a86';
  ctx.fillRect(L.stack.x, L.stack.y, L.stack.w, L.stack.h);
  ctx.fillStyle = '#5c534c';
  ctx.fillRect(L.stack.x - s * 0.015, L.stack.y, L.stack.w + s * 0.03, s * 0.04);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(L.stack.x, L.stack.y, s * 0.025, L.stack.h);
  for (const w of L.wins) drawWindow(ctx, s, w, th);
  ctx.fillStyle = '#6a5c52';
  roundRect(ctx, L.door.x, L.door.y, L.door.w, L.door.h, s * 0.015);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  for (let i = 0; i < 3; i++) ctx.fillRect(L.door.x + s * 0.02, L.door.y + s * 0.03 + i * s * 0.04, L.door.w - s * 0.04, s * 0.012);
}

function drawStation(ctx: Ctx, s: number, th: DistrictTheme, plan: Plan) {
  const L = stationLayout(s);
  contact(ctx, L.x + L.w * 0.5, L.y + L.h + s * 0.02, L.w * 0.48, s * 0.055);
  ctx.fillStyle = th.wall[plan.wall];
  roundRect(ctx, L.x, L.y + s * 0.08, L.w, L.h - s * 0.08, s * 0.03);
  ctx.fill();
  inkStroke(ctx, s);
  ctx.fillStyle = th.roof[plan.wall];
  ctx.beginPath();
  ctx.moveTo(L.x - s * 0.02, L.y + s * 0.16);
  ctx.quadraticCurveTo(L.x + L.w / 2, L.y - s * 0.12, L.x + L.w + s * 0.02, L.y + s * 0.16);
  ctx.lineTo(L.x + L.w, L.y + s * 0.2);
  ctx.quadraticCurveTo(L.x + L.w / 2, L.y - s * 0.04, L.x, L.y + s * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = th.roofDark[plan.wall];
  ctx.lineWidth = Math.max(1, s * 0.016);
  ctx.stroke();
  ctx.fillStyle = '#f4efe6';
  ctx.beginPath();
  ctx.arc(L.x + L.w / 2, L.y + s * 0.2, s * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = th.ink;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(L.x + L.w / 2, L.y + s * 0.2);
  ctx.lineTo(L.x + L.w / 2 + s * 0.03, L.y + s * 0.16);
  ctx.moveTo(L.x + L.w / 2, L.y + s * 0.2);
  ctx.lineTo(L.x + L.w / 2 - s * 0.02, L.y + s * 0.24);
  ctx.stroke();
  ctx.fillStyle = th.ink;
  ctx.fillRect(L.x + s * 0.08, L.y + s * 0.22, s * 0.035, L.h - s * 0.16);
  ctx.fillRect(L.x + L.w - s * 0.12, L.y + s * 0.22, s * 0.035, L.h - s * 0.16);
  for (const w of L.wins) drawWindow(ctx, s, w, th);
  ctx.fillStyle = th.stoneDark;
  ctx.fillRect(L.x, L.y + L.h - s * 0.04, L.w, s * 0.045);
}

function drawTrunk(ctx: Ctx, tree: Tree) {
  const { x, y, r, sp } = tree;
  ctx.strokeStyle = '#7a5234';
  ctx.lineWidth = Math.max(1.5, r * (sp === 'palm' ? 0.16 : 0.2));
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (sp === 'palm') {
    ctx.moveTo(x + r * 0.15, y + r * 1.25);
    ctx.quadraticCurveTo(x + r * 0.55, y + r * 0.45, x, y + r * 0.1);
  } else if (sp === 'pine') {
    ctx.moveTo(x, y + r * 0.45);
    ctx.lineTo(x, y + r * 1.2);
  } else {
    ctx.moveTo(x, y + r * 0.25);
    ctx.lineTo(x, y + r * 1.05);
  }
  ctx.stroke();
}

function drawCanopy(ctx: Ctx, tree: Tree, sway: number, th: DistrictTheme) {
  const { x, y, r, sp } = tree;
  const cx = x + sway;
  ctx.fillStyle = 'rgba(40, 50, 30, 0.16)';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.12, y + r * 0.9, r * 0.85, r * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  if (sp === 'pine') {
    const tri = (px: number, py: number, tw: number, thh: number, color: string) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(px, py - thh * 0.62);
      ctx.lineTo(px - tw / 2, py + thh * 0.38);
      ctx.lineTo(px + tw / 2, py + thh * 0.38);
      ctx.closePath();
      ctx.fill();
    };
    tri(cx + r * 0.04, y + r * 0.35, r * 2.2, r * 1.15, th.pineDark);
    tri(cx, y + r * 0.05, r * 1.7, r * 1.05, th.pine);
    tri(cx - r * 0.04, y - r * 0.28, r * 1.05, r * 0.85, th.leafHi);
    return;
  }
  if (sp === 'palm') {
    ctx.strokeStyle = th.leafDark;
    ctx.lineWidth = Math.max(1.5, r * 0.16);
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI * 0.95 + (i / 5) * Math.PI * 1.15;
      ctx.beginPath();
      ctx.moveTo(cx, y);
      ctx.quadraticCurveTo(cx + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.35, cx + Math.cos(a) * r * 1.2, y + Math.sin(a) * r * 0.7);
      ctx.stroke();
    }
    ctx.fillStyle = th.leafDark;
    ctx.beginPath();
    ctx.arc(cx, y, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c4a05a';
    ctx.beginPath();
    ctx.arc(cx + r * 0.08, y + r * 0.12, r * 0.08, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const leaf = sp === 'bloom' ? th.bloom : th.leaf;
  const dark = sp === 'bloom' ? th.bloomDark : th.leafDark;
  const hi = sp === 'bloom' ? '#ffe0ea' : th.leafHi;
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(cx + r * 0.12, y + r * 0.08, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = leaf;
  ctx.beginPath();
  ctx.arc(cx - r * 0.18, y - r * 0.12, r * 0.82, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hi;
  ctx.beginPath();
  ctx.arc(cx - r * 0.32, y - r * 0.32, r * 0.4, 0, Math.PI * 2);
  ctx.fill();
  if (sp === 'bloom') {
    ctx.fillStyle = '#fff6f8';
    for (const [ox, oy] of [[-0.2, 0.15], [0.25, 0.05], [0.05, -0.35], [-0.4, -0.05]] as const) {
      ctx.beginPath();
      ctx.arc(cx + ox * r, y + oy * r, r * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawPond(ctx: Ctx, s: number, th: DistrictTheme) {
  ctx.fillStyle = 'rgba(30, 50, 40, 0.15)';
  ctx.beginPath();
  ctx.ellipse(s * 0.5, s * 0.58, s * 0.2, s * 0.11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = th.waterDeep;
  ctx.beginPath();
  ctx.ellipse(s * 0.48, s * 0.56, s * 0.18, s * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = th.water;
  ctx.beginPath();
  ctx.ellipse(s * 0.45, s * 0.54, s * 0.11, s * 0.055, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawStall(ctx: Ctx, s: number, th: DistrictTheme) {
  ctx.fillStyle = th.ink;
  ctx.fillRect(s * 0.48, s * 0.42, s * 0.03, s * 0.26);
  ctx.fillStyle = th.awning[0];
  ctx.beginPath();
  ctx.arc(s * 0.5, s * 0.4, s * 0.2, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = th.awning[1];
  ctx.beginPath();
  ctx.moveTo(s * 0.5, s * 0.4);
  ctx.arc(s * 0.5, s * 0.4, s * 0.2, Math.PI * 1.15, Math.PI * 1.4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,24,16,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(s * 0.5, s * 0.4, s * 0.2, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = '#c4894a';
  ctx.fillRect(s * 0.62, s * 0.6, s * 0.14, s * 0.1);
  ctx.strokeStyle = '#8a5a32';
  ctx.strokeRect(s * 0.62, s * 0.6, s * 0.14, s * 0.1);
}

function drawPark(ctx: Ctx, s: number, th: DistrictTheme, plan: Plan) {
  ctx.strokeStyle = th.soil;
  ctx.lineWidth = s * 0.07;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(s * 0.18, s * 0.78);
  ctx.quadraticCurveTo(s * 0.45, s * 0.58, s * 0.84, s * 0.74);
  ctx.stroke();
  if (plan.pond) drawPond(ctx, s, th);
  if (plan.stall) drawStall(ctx, s, th);
  if (plan.flower) {
    const cols = [th.bloom, '#f0c14a', '#fff'];
    const spots = [[0.2, 0.74], [0.32, 0.8], [0.78, 0.76]];
    spots.forEach(([fx, fy], i) => {
      ctx.fillStyle = cols[i % cols.length];
      ctx.beginPath();
      ctx.arc(s * fx, s * fy, s * 0.02, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  for (const tree of plan.trees) drawTrunk(ctx, tree);
}

function drawLampPost(ctx: Ctx, s: number, lamp: { x: number; y: number }, th: DistrictTheme) {
  ctx.strokeStyle = th.ink;
  ctx.lineWidth = Math.max(1.25, s * 0.02);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(lamp.x, lamp.y);
  ctx.lineTo(lamp.x, lamp.y - s * 0.16);
  ctx.stroke();
  ctx.fillStyle = '#3a342c';
  roundRect(ctx, lamp.x - s * 0.03, lamp.y - s * 0.2, s * 0.06, s * 0.05, s * 0.012);
  ctx.fill();
}

export function drawBlock(ctx: Ctx, s: number, seed: number, district = 0) {
  const th = themeFor(district);
  const plan = blockPlan(seed, s, district);
  const stone = plan.kind !== 'park' && (district === 1 || plan.kind === 'tower' || plan.kind === 'station' || plan.kind === 'factory');
  drawPad(ctx, s, th, stone);
  if (plan.kind === 'park') drawPark(ctx, s, th, plan);
  else if (plan.kind === 'house') drawHouse(ctx, s, th, plan);
  else if (plan.kind === 'shop') drawShop(ctx, s, th, plan);
  else if (plan.kind === 'tower') drawTower(ctx, s, th, plan);
  else if (plan.kind === 'factory') drawFactory(ctx, s, th, plan);
  else drawStation(ctx, s, th, plan);
  if (plan.lamp && plan.kind !== 'park') drawLampPost(ctx, s, plan.lamp, th);
}

/** Idle overlay: swaying canopies, twinkling windows, steam. Cheap shapes, no gradients. */
export function drawBlockLife(ctx: Ctx, s: number, seed: number, now: number, district = 0) {
  const th = themeFor(district);
  const plan = blockPlan(seed, s, district);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, s, s);
  ctx.clip();
  const sway = Math.sin(now / 900 + seed * 0.17) * s * 0.012;
  for (const tree of plan.trees) {
    const amp = tree.sp === 'palm' ? 2.2 : tree.sp === 'pine' ? 0.45 : 1;
    drawCanopy(ctx, tree, sway * amp + Math.sin(now / 700 + tree.x) * s * 0.004, th);
  }
  for (const w of plan.windows) {
    const phase = 0.5 + 0.5 * Math.sin(now / 520 + w.x * 0.37 + seed);
    if (phase < 0.42) continue;
    ctx.globalAlpha = (phase - 0.42) * 0.95;
    ctx.fillStyle = '#ffd56a';
    ctx.fillRect(w.x, w.y, w.w, w.h);
  }
  ctx.globalAlpha = 1;
  if (plan.steam) {
    for (let i = 0; i < 3; i++) {
      const p = (now / 1500 + i / 3 + seed * 0.001) % 1;
      ctx.globalAlpha = (1 - p) * 0.45;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(plan.steam.x + Math.sin(p * 6 + i) * s * 0.03, plan.steam.y - p * s * 0.2, s * (0.025 + p * 0.04), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  if (plan.pond) {
    const p = (now / 1400 + seed * 0.01) % 1;
    ctx.globalAlpha = 1 - p;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(s * 0.48, s * 0.55, s * (0.05 + p * 0.1), s * (0.025 + p * 0.045), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (plan.lamp) {
    const a = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(now / 380 + seed));
    ctx.fillStyle = `rgba(255, 214, 120, ${a})`;
    ctx.beginPath();
    ctx.arc(plan.lamp.x, plan.lamp.y - s * 0.175, s * 0.045, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

const ARROW: Record<number, number> = { [N]: -Math.PI / 2, [E]: 0, [S]: Math.PI / 2, [W]: Math.PI };

function drawMouth(ctx: Ctx, type: PathType, dir: number, s: number, lit: boolean) {
  const [dx, dy] = DIR_VEC[dir];
  const x = s / 2 + dx * s * 0.4;
  const y = s / 2 + dy * s * 0.4;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.atan2(dy, dx));
  if (lit) {
    ctx.fillStyle = 'rgba(255, 214, 120, 0.45)';
    ctx.beginPath();
    ctx.arc(-s * 0.02, 0, s * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = type === 'road' ? '#ffe08a' : type === 'rail' ? '#ffffff' : '#e7f7ff';
  ctx.strokeStyle = type === 'road' ? '#232836' : type === 'rail' ? '#4a3428' : '#064e6c';
  ctx.lineWidth = Math.max(1.4, s * 0.038);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(s * 0.11, 0);
  ctx.lineTo(-s * 0.05, -s * 0.095);
  ctx.lineTo(-s * 0.05, s * 0.095);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function drawEndpoint(ctx: Ctx, cell: Cell, s: number, lit: boolean, district = 0) {
  const type = cell.type!;
  const dir = cell.dir!;
  const th = themeFor(district);
  const src = cell.kind === 'source';
  drawPad(ctx, s, th, type !== 'road' || district === 1);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, s, s);
  ctx.clip();
  DRAW[type](ctx, dir, s);
  ctx.restore();
  ctx.save();
  ctx.translate(s / 2, s / 2);
  ctx.rotate(ARROW[dir] + Math.PI / 2);
  ctx.translate(-s / 2, -s / 2);
  if (type === 'road') src ? drawGarage(ctx, s, lit) : drawDestHouse(ctx, s, th, lit);
  else if (type === 'rail') drawRailStop(ctx, s, th, src, lit);
  else src ? drawWaterTower(ctx, s, lit) : drawFountain(ctx, s, th, lit);
  ctx.restore();
  drawMouth(ctx, type, dir, s, lit);
}

function drawGarage(ctx: Ctx, s: number, lit: boolean) {
  const x = s * 0.16;
  const y = s * 0.36;
  const w = s * 0.66;
  const h = s * 0.46;
  contact(ctx, x + w * 0.5, y + h, w * 0.48, s * 0.05);
  ctx.fillStyle = '#e07a32';
  roundRect(ctx, x + s * 0.05, y + s * 0.05, w, h, s * 0.06);
  ctx.fill();
  ctx.fillStyle = '#ffb15a';
  roundRect(ctx, x, y, w, h, s * 0.06);
  ctx.fill();
  ctx.strokeStyle = '#c45a22';
  ctx.lineWidth = Math.max(1, s * 0.02);
  ctx.stroke();
  ctx.fillStyle = '#f07828';
  roundRect(ctx, x, y, w, s * 0.12, s * 0.04);
  ctx.fill();
  ctx.fillStyle = '#fff6ea';
  roundRect(ctx, x + s * 0.1, y + s * 0.16, w - s * 0.2, s * 0.22, s * 0.03);
  ctx.fill();
  ctx.fillStyle = '#f0d2b4';
  for (let i = 0; i < 3; i++) ctx.fillRect(x + s * 0.12, y + s * 0.2 + i * s * 0.06, w - s * 0.24, s * 0.018);
  ctx.fillStyle = lit ? '#ffe08a' : '#fff';
  ctx.beginPath();
  ctx.arc(x + w / 2, y + s * 0.04, s * 0.035, 0, Math.PI * 2);
  ctx.fill();
}

function drawDestHouse(ctx: Ctx, s: number, th: DistrictTheme, lit: boolean) {
  const x = s * 0.2;
  const y = s * 0.46;
  const w = s * 0.56;
  const h = s * 0.36;
  contact(ctx, x + w * 0.5, y + h, w * 0.48, s * 0.045);
  ctx.fillStyle = th.wall[0];
  roundRect(ctx, x, y, w, h, s * 0.03);
  ctx.fill();
  inkStroke(ctx, s);
  ctx.fillStyle = th.roof[0];
  ctx.beginPath();
  ctx.moveTo(x - s * 0.03, y + s * 0.04);
  ctx.lineTo(x + w / 2, y - s * 0.16);
  ctx.lineTo(x + w + s * 0.03, y + s * 0.04);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = lit ? '#ffe08a' : '#c5d4e4';
  ctx.fillRect(x + w * 0.32, y + h * 0.28, s * 0.14, s * 0.1);
  ctx.strokeStyle = th.ink;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + w * 0.32, y + h * 0.28, s * 0.14, s * 0.1);
  ctx.fillStyle = th.ink;
  roundRect(ctx, x + w * 0.38, y + h - s * 0.12, s * 0.1, s * 0.12, s * 0.02);
  ctx.fill();
  ctx.fillStyle = th.roofDark[0];
  ctx.fillRect(x + w * 0.72, y - s * 0.1, s * 0.05, s * 0.12);
}

function drawRailStop(ctx: Ctx, s: number, th: DistrictTheme, src: boolean, lit: boolean) {
  const x = s * 0.16;
  const y = s * 0.38;
  const w = s * 0.66;
  const h = s * 0.42;
  contact(ctx, x + w / 2, y + h, w * 0.46, s * 0.05);
  ctx.fillStyle = src ? '#cbb6f0' : '#f7c3da';
  roundRect(ctx, x, y + s * 0.1, w, h - s * 0.1, s * 0.06);
  ctx.fill();
  ctx.strokeStyle = src ? '#6d52b0' : '#c45b88';
  ctx.lineWidth = Math.max(1, s * 0.018);
  ctx.stroke();
  ctx.fillStyle = src ? '#7c5cc4' : '#e56b9a';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.02, y + s * 0.18);
  ctx.quadraticCurveTo(x + w / 2, y - s * 0.08, x + w + s * 0.02, y + s * 0.18);
  ctx.lineTo(x + w, y + s * 0.24);
  ctx.quadraticCurveTo(x + w / 2, y + s * 0.02, x, y + s * 0.24);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillRect(x + s * 0.1, y + s * 0.26, w - s * 0.2, s * 0.06);
  ctx.fillStyle = lit ? '#ffe08a' : '#efe8ff';
  ctx.beginPath();
  ctx.arc(x + w / 2, y + s * 0.4, s * 0.055, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = th.ink;
  ctx.fillRect(x + s * 0.08, y + h - s * 0.08, s * 0.04, s * 0.08);
  ctx.fillRect(x + w - s * 0.12, y + h - s * 0.08, s * 0.04, s * 0.08);
}

function drawWaterTower(ctx: Ctx, s: number, lit: boolean) {
  ctx.strokeStyle = '#0c6484';
  ctx.lineWidth = s * 0.045;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(s * 0.34, s * 0.52);
  ctx.lineTo(s * 0.28, s * 0.82);
  ctx.moveTo(s * 0.66, s * 0.52);
  ctx.lineTo(s * 0.72, s * 0.82);
  ctx.moveTo(s * 0.34, s * 0.62);
  ctx.lineTo(s * 0.66, s * 0.62);
  ctx.stroke();
  contact(ctx, s * 0.5, s * 0.8, s * 0.24, s * 0.04);
  const g = ctx.createLinearGradient(s * 0.22, 0, s * 0.78, 0);
  g.addColorStop(0, '#d9f4ff');
  g.addColorStop(0.45, '#7ecff2');
  g.addColorStop(1, '#1f8fbf');
  ctx.fillStyle = g;
  roundRect(ctx, s * 0.22, s * 0.28, s * 0.56, s * 0.28, s * 0.12);
  ctx.fill();
  ctx.strokeStyle = '#064e6c';
  ctx.lineWidth = Math.max(1, s * 0.02);
  ctx.stroke();
  ctx.fillStyle = lit ? '#e7f7ff' : 'rgba(255,255,255,0.55)';
  ctx.fillRect(s * 0.3, s * 0.34, s * 0.4, s * 0.045);
  ctx.fillStyle = '#064e6c';
  ctx.fillRect(s * 0.46, s * 0.2, s * 0.06, s * 0.1);
}

function drawFountain(ctx: Ctx, s: number, th: DistrictTheme, lit: boolean) {
  ctx.fillStyle = th.stoneDark;
  ctx.beginPath();
  ctx.arc(s / 2, s * 0.58, s * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = th.grass;
  ctx.beginPath();
  ctx.arc(s / 2, s * 0.58, s * 0.24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = lit ? '#7fd4f5' : '#d5e6ee';
  ctx.beginPath();
  ctx.arc(s / 2, s * 0.58, s * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = s * 0.015;
  ctx.beginPath();
  ctx.arc(s / 2, s * 0.58, s * 0.1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#f4f7f8';
  ctx.beginPath();
  ctx.arc(s / 2, s * 0.5, s * 0.035, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = lit ? '#e7f7ff' : '#ffffff';
  ctx.fillRect(s * 0.485, s * 0.4, s * 0.03, s * 0.12);
}

/** Rounded board panel, cached by the view. */
export function paintBackdrop(ctx: Ctx, w: number, h: number, district: number, cols: number, rows: number, cell: number, pad: number) {
  const th = themeFor(district);
  const margin = 10;
  const gridW = cols * cell;
  const gridH = rows * cell;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(62, 42, 28, 0.16)';
  roundRect(ctx, pad - margin + 3, pad - margin + 5, gridW + margin * 2, gridH + margin * 2, 26);
  ctx.fill();
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, th.ground);
  g.addColorStop(1, th.groundDeep);
  ctx.fillStyle = g;
  roundRect(ctx, pad - margin, pad - margin, gridW + margin * 2, gridH + margin * 2, 24);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  roundRect(ctx, pad - margin + 3, pad - margin + 3, gridW + margin * 2 - 6, gridH + margin * 2 - 6, 20);
  ctx.stroke();
  ctx.strokeStyle = th.grout;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  for (let r = 1; r < rows; r++) {
    ctx.moveTo(pad, pad + r * cell);
    ctx.lineTo(pad + cols * cell, pad + r * cell);
  }
  for (let c = 1; c < cols; c++) {
    ctx.moveTo(pad + c * cell, pad);
    ctx.lineTo(pad + c * cell, pad + rows * cell);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  const rnd = rand(district * 97 + cols * 13 + rows);
  ctx.fillStyle = 'rgba(90, 60, 30, 0.05)';
  for (let i = 0; i < 16; i++) {
    ctx.beginPath();
    ctx.ellipse(8 + rnd() * (w - 24), 8 + rnd() * (h - 24), 1.2 + rnd() * 1.6, 0.8, rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
}
