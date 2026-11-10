import { maskFor } from '../engine/pieces';
import { E, N, S, W, type Cell, type Layer, type PathType, type Segment, type Sticker } from '../engine/types';
import { PAL, TYPE_COLOR } from './palette';

type Ctx = CanvasRenderingContext2D;

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const DIR_VEC: Record<number, [number, number]> = { [N]: [0, -1], [E]: [1, 0], [S]: [0, 1], [W]: [-1, 0] };
const ALL = [N, E, S, W];
const bits = (m: number) => ALL.filter((d) => m & d);

/** Corner pairs get a smooth arc; returns the tile corner (in 0..1 units) the arc is centered on. */
function cornerOf(mask: number): [number, number] | null {
  const b = bits(mask);
  if (b.length !== 2) return null;
  const [a, c] = b;
  if ((a | c) === (N | S) || (a | c) === (E | W)) return null;
  const v1 = DIR_VEC[a];
  const v2 = DIR_VEC[c];
  return [0.5 + 0.5 * (v1[0] + v2[0]), 0.5 + 0.5 * (v1[1] + v2[1])];
}

/** Trace the centerline of a segment mask as one or more sub-paths in an s-sized tile. */
function traceArms(ctx: Ctx, mask: number, s: number) {
  ctx.beginPath();
  const corner = cornerOf(mask);
  if (corner) {
    const [cx, cy] = corner;
    // start/end angles from the corner point
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
    ctx.lineTo(s / 2 + dx * s / 2, s / 2 + dy * s / 2);
    return;
  }
  for (const d of bs) {
    const [dx, dy] = DIR_VEC[d];
    ctx.moveTo(s / 2, s / 2);
    ctx.lineTo(s / 2 + dx * s / 2, s / 2 + dy * s / 2);
  }
}

function deadEndCap(ctx: Ctx, mask: number, s: number, color: string, r: number) {
  if (bits(mask).length !== 1) return;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, r, 0, Math.PI * 2);
  ctx.fill();
}

export function drawRoad(ctx: Ctx, mask: number, s: number) {
  ctx.lineCap = bits(mask).length === 1 ? 'round' : 'butt';
  ctx.lineJoin = 'round';
  traceArms(ctx, mask, s);
  ctx.strokeStyle = PAL.roadEdge;
  ctx.lineWidth = s * 0.48;
  ctx.stroke();
  traceArms(ctx, mask, s);
  ctx.strokeStyle = PAL.road;
  ctx.lineWidth = s * 0.42;
  ctx.stroke();
  if (bits(mask).length >= 3) {
    // fill junction center so arms merge cleanly
    ctx.fillStyle = PAL.road;
    ctx.fillRect(s * 0.29, s * 0.29, s * 0.42, s * 0.42);
  }
  traceArms(ctx, mask, s);
  ctx.setLineDash([s * 0.09, s * 0.08]);
  ctx.strokeStyle = PAL.roadLine;
  ctx.lineWidth = s * 0.04;
  ctx.stroke();
  ctx.setLineDash([]);
  deadEndCap(ctx, mask, s, PAL.roadLine, s * 0.07);
}

export function drawRail(ctx: Ctx, mask: number, s: number) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';
  traceArms(ctx, mask, s);
  ctx.strokeStyle = PAL.railBed;
  ctx.lineWidth = s * 0.44;
  ctx.stroke();
  traceArms(ctx, mask, s);
  ctx.setLineDash([s * 0.05, s * 0.075]);
  ctx.strokeStyle = PAL.railTie;
  ctx.lineWidth = s * 0.34;
  ctx.stroke();
  ctx.setLineDash([]);
  // two steel rails
  const o = s * 0.1;
  ctx.strokeStyle = PAL.railSteel;
  ctx.lineWidth = s * 0.045;
  ctx.beginPath();
  const corner = cornerOf(mask);
  if (corner) {
    const [cx, cy] = corner;
    for (const rr of [s / 2 - o, s / 2 + o]) {
      ctx.moveTo(cx * s + rr, cy * s);
      ctx.arc(cx * s, cy * s, rr, 0, Math.PI * 2);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, s, s);
    ctx.clip();
    ctx.beginPath();
    for (const rr of [s / 2 - o, s / 2 + o]) {
      ctx.moveTo(cx * s + rr, cy * s);
      ctx.arc(cx * s, cy * s, rr, 0, Math.PI * 2);
    }
    ctx.stroke();
    ctx.restore();
  } else {
    const bs = bits(mask);
    for (const d of bs) {
      const [dx, dy] = DIR_VEC[d];
      const px = -dy;
      const py = dx;
      const startT = bs.length === 1 ? 0 : 0;
      for (const sg of [-1, 1]) {
        ctx.moveTo(s / 2 + px * o * sg + dx * startT, s / 2 + py * o * sg + dy * startT);
        ctx.lineTo(s / 2 + px * o * sg + (dx * s) / 2, s / 2 + py * o * sg + (dy * s) / 2);
      }
    }
    ctx.stroke();
  }
  deadEndCap(ctx, mask, s, PAL.railTie, s * 0.13);
}

export function drawPipe(ctx: Ctx, mask: number, s: number) {
  ctx.lineCap = bits(mask).length === 1 ? 'round' : 'butt';
  ctx.lineJoin = 'round';
  traceArms(ctx, mask, s);
  ctx.strokeStyle = PAL.pipeDark;
  ctx.lineWidth = s * 0.32;
  ctx.stroke();
  traceArms(ctx, mask, s);
  ctx.strokeStyle = PAL.pipe;
  ctx.lineWidth = s * 0.26;
  ctx.stroke();
  traceArms(ctx, mask, s);
  ctx.strokeStyle = PAL.pipeHi;
  ctx.lineWidth = s * 0.06;
  ctx.stroke();
  // flanges at each open edge
  ctx.fillStyle = PAL.pipeDark;
  for (const d of bits(mask)) {
    const [dx, dy] = DIR_VEC[d];
    const cx = s / 2 + dx * s * 0.44;
    const cy = s / 2 + dy * s * 0.44;
    if (dx) ctx.fillRect(cx - s * 0.035, cy - s * 0.2, s * 0.07, s * 0.4);
    else ctx.fillRect(cx - s * 0.2, cy - s * 0.035, s * 0.4, s * 0.07);
  }
  if (bits(mask).length >= 3) {
    ctx.fillStyle = PAL.pipe;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.17, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PAL.pipeDark;
    ctx.lineWidth = s * 0.03;
    ctx.stroke();
  }
  deadEndCap(ctx, mask, s, PAL.pipeDark, s * 0.13);
}

const DRAW: Record<PathType, (ctx: Ctx, m: number, s: number) => void> = { road: drawRoad, rail: drawRail, pipe: drawPipe };

/** Draw path art for a set of segments. Multi-type stickers draw as a bridge (second type on top). */
export function drawSegments(ctx: Ctx, segs: Segment[], s: number) {
  const order: PathType[] = ['pipe', 'rail', 'road'];
  const present = order.filter((t) => maskFor(segs, t));
  present.forEach((t, i) => {
    if (i > 0) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = s * 0.06;
      ctx.shadowOffsetY = s * 0.03;
      DRAW[t](ctx, maskFor(segs, t), s);
      ctx.restore();
    } else DRAW[t](ctx, maskFor(segs, t), s);
  });
}

/** A sticker: white die-cut paper with art, plus badges for rigid / pinned. */
export function drawSticker(ctx: Ctx, st: Sticker, s: number) {
  const inset = s * 0.04;
  const r = s * 0.14;
  ctx.save();
  roundRect(ctx, inset, inset, s - inset * 2, s - inset * 2, r);
  ctx.fillStyle = st.junk ? PAL.junk : PAL.paper;
  ctx.fill();
  ctx.lineWidth = Math.max(1, s * 0.02);
  ctx.strokeStyle = st.junk ? PAL.junkDark : PAL.paperEdge;
  ctx.stroke();
  ctx.clip();
  if (st.junk) drawJunk(ctx, s, st.id);
  else drawSegments(ctx, st.segments, s);
  ctx.restore();
  if (st.rigid) {
    // stiff card stock: hatched amber frame
    ctx.save();
    roundRect(ctx, inset, inset, s - inset * 2, s - inset * 2, r);
    ctx.lineWidth = s * 0.07;
    ctx.strokeStyle = PAL.rigid;
    ctx.setLineDash([s * 0.06, s * 0.05]);
    ctx.stroke();
    ctx.restore();
  }
  if (st.pinned) drawPin(ctx, s * 0.2, s * 0.2, s * 0.09);
}

export function drawPin(ctx: Ctx, x: number, y: number, r: number) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.arc(x + r * 0.35, y + r * 0.45, r, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  g.addColorStop(0, '#ffc2cb');
  g.addColorStop(1, PAL.pin);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function rand(seed: number) {
  let x = (seed * 9301 + 49297) % 233280;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
}

function drawJunk(ctx: Ctx, s: number, seed: number) {
  const rnd = rand(seed + 7);
  // playful litter: stripes, confetti and a crumpled-paper zigzag
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = s * 0.05;
  for (let i = -1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(i * s * 0.3, 0);
    ctx.lineTo(i * s * 0.3 + s, s);
    ctx.stroke();
  }
  const cols = ['#fff3c4', '#a0e7ff', '#caffbf', '#ffffff'];
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = cols[i % cols.length];
    const x = s * (0.15 + rnd() * 0.7);
    const y = s * (0.15 + rnd() * 0.7);
    ctx.beginPath();
    ctx.arc(x, y, s * (0.03 + rnd() * 0.035), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = PAL.junkDark;
  ctx.lineWidth = s * 0.035;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(s * 0.28, s * 0.62);
  ctx.lineTo(s * 0.38, s * 0.42);
  ctx.lineTo(s * 0.5, s * 0.6);
  ctx.lineTo(s * 0.62, s * 0.4);
  ctx.lineTo(s * 0.72, s * 0.6);
  ctx.stroke();
}

export function drawRubble(ctx: Ctx, s: number, seed: number) {
  const rnd = rand(seed + 3);
  roundRect(ctx, s * 0.04, s * 0.04, s * 0.92, s * 0.92, s * 0.12);
  ctx.fillStyle = PAL.rubble;
  ctx.fill();
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 ? PAL.rubbleDark : '#cfc8bf';
    const x = s * (0.2 + rnd() * 0.6);
    const y = s * (0.2 + rnd() * 0.6);
    ctx.beginPath();
    ctx.ellipse(x, y, s * (0.06 + rnd() * 0.08), s * (0.05 + rnd() * 0.05), rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = PAL.rubbleDark;
  ctx.lineWidth = s * 0.025;
  ctx.beginPath();
  ctx.moveTo(s * 0.15, s * 0.3);
  ctx.lineTo(s * 0.4, s * 0.45);
  ctx.lineTo(s * 0.35, s * 0.7);
  ctx.moveTo(s * 0.4, s * 0.45);
  ctx.lineTo(s * 0.8, s * 0.35);
  ctx.stroke();
}

/** Color used for the visible edge of a buried layer: the "edge clue". */
export function layerTint(l: Layer): string {
  if (l.kind === 'rubble') return PAL.rubbleDark;
  if (l.junk) return PAL.junkDark;
  const t = l.segments[0]?.type ?? 'road';
  return TYPE_COLOR[t];
}

export function drawLayer(ctx: Ctx, l: Layer, s: number) {
  if (l.kind === 'rubble') drawRubble(ctx, s, l.id);
  else drawSticker(ctx, l, s);
}

/** Empty ground lot: soft paving with a dashed drop zone. */
export function drawLot(ctx: Ctx, s: number) {
  roundRect(ctx, s * 0.06, s * 0.06, s * 0.88, s * 0.88, s * 0.14);
  ctx.fillStyle = PAL.lot;
  ctx.fill();
  ctx.setLineDash([s * 0.07, s * 0.06]);
  ctx.lineWidth = Math.max(1, s * 0.025);
  ctx.strokeStyle = PAL.lotDash;
  ctx.stroke();
  ctx.setLineDash([]);
}

/** City block decor, chosen deterministically from position. */
export function drawBlock(ctx: Ctx, s: number, seed: number, restored = true) {
  const rnd = rand(seed * 13 + 5);
  const kind = rnd();
  if (kind < 0.3) {
    // trees in a little park
    ctx.fillStyle = '#e4f3dc';
    roundRect(ctx, s * 0.05, s * 0.05, s * 0.9, s * 0.9, s * 0.16);
    ctx.fill();
    const n = 2 + Math.floor(rnd() * 2);
    for (let i = 0; i < n; i++) {
      const x = s * (0.28 + rnd() * 0.44);
      const y = s * (0.3 + rnd() * 0.4);
      const r = s * (0.13 + rnd() * 0.06);
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.beginPath();
      ctx.ellipse(x + r * 0.2, y + r * 0.7, r, r * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = restored ? PAL.treeDark : '#b9b9b9';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = restored ? PAL.tree : '#cfcfcf';
      ctx.beginPath();
      ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  const ci = Math.floor(rnd() * PAL.buildings.length);
  const body = restored ? PAL.buildings[ci] : '#dcd7d2';
  const roof = restored ? PAL.roofs[ci] : '#bdb6af';
  // shadow
  ctx.fillStyle = 'rgba(84,60,40,0.12)';
  roundRect(ctx, s * 0.12, s * 0.16, s * 0.82, s * 0.8, s * 0.12);
  ctx.fill();
  ctx.fillStyle = body;
  roundRect(ctx, s * 0.08, s * 0.08, s * 0.8, s * 0.8, s * 0.12);
  ctx.fill();
  ctx.fillStyle = roof;
  roundRect(ctx, s * 0.16, s * 0.16, s * 0.64, s * 0.64, s * 0.08);
  ctx.fill();
  // rooftop details
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  const d = Math.floor(rnd() * 3);
  if (d === 0) {
    ctx.beginPath();
    ctx.arc(s * 0.48, s * 0.48, s * 0.12, 0, Math.PI * 2);
    ctx.fill();
  } else if (d === 1) {
    ctx.fillRect(s * 0.26, s * 0.26, s * 0.16, s * 0.16);
    ctx.fillRect(s * 0.52, s * 0.5, s * 0.16, s * 0.16);
  } else {
    for (let i = 0; i < 3; i++) ctx.fillRect(s * (0.24 + i * 0.16), s * 0.3, s * 0.08, s * 0.36);
  }
}

const ARROW: Record<number, number> = { [N]: -Math.PI / 2, [E]: 0, [S]: Math.PI / 2, [W]: Math.PI };

/** Sources and destinations: small original buildings; the opening side gets a stub of path. */
export function drawEndpoint(ctx: Ctx, cell: Cell, s: number, lit: boolean) {
  const type = cell.type!;
  const dir = cell.dir!;
  // stub of path toward the opening
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, s, s);
  ctx.clip();
  DRAW[type](ctx, dir, s);
  ctx.restore();
  ctx.save();
  ctx.translate(s / 2, s / 2);
  ctx.rotate(ARROW[dir] + Math.PI / 2); // art drawn facing "up"; rotate to face opening
  ctx.translate(-s / 2, -s / 2);
  const src = cell.kind === 'source';
  const base = s * 0.12;
  ctx.fillStyle = 'rgba(84,60,40,0.18)';
  roundRect(ctx, base + s * 0.03, base + s * 0.2, s - base * 2, s * 0.6, s * 0.12);
  ctx.fill();
  if (type === 'road') {
    if (src) {
      // garage: orange box with roller door facing the road
      ctx.fillStyle = '#ffb36b';
      roundRect(ctx, base, base + s * 0.14, s - base * 2, s * 0.6, s * 0.1);
      ctx.fill();
      ctx.fillStyle = '#f3843d';
      roundRect(ctx, base, base + s * 0.14, s - base * 2, s * 0.16, s * 0.08);
      ctx.fill();
      ctx.fillStyle = '#fff3e4';
      ctx.fillRect(s * 0.3, s * 0.2, s * 0.4, s * 0.06);
      for (let i = 0; i < 3; i++) ctx.fillRect(s * 0.3, s * (0.36 + i * 0.1), s * 0.4, s * 0.05);
    } else {
      // little house with a gabled roof and a lit window
      ctx.fillStyle = '#fff0c2';
      roundRect(ctx, base + s * 0.04, base + s * 0.3, s - base * 2 - s * 0.08, s * 0.44, s * 0.06);
      ctx.fill();
      ctx.fillStyle = '#ff8a8a';
      ctx.beginPath();
      ctx.moveTo(base - s * 0.02, base + s * 0.34);
      ctx.lineTo(s / 2, base + s * 0.02);
      ctx.lineTo(s - base + s * 0.02, base + s * 0.34);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = lit ? '#ffd54a' : '#c9d3e6';
      ctx.fillRect(s * 0.4, s * 0.5, s * 0.2, s * 0.16);
    }
  } else if (type === 'rail') {
    ctx.fillStyle = src ? '#b9a0ff' : '#ff9fd0';
    roundRect(ctx, base, base + s * 0.14, s - base * 2, s * 0.6, s * 0.1);
    ctx.fill();
    ctx.fillStyle = src ? '#8f6ff0' : '#f06fb0';
    // arch / shelter roof
    ctx.beginPath();
    ctx.arc(s / 2, base + s * 0.2, s * 0.32, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(s * 0.32, s * 0.38, s * 0.36, s * 0.08);
    ctx.fillStyle = lit ? '#ffd54a' : '#e8e0ff';
    ctx.beginPath();
    ctx.arc(s / 2, s * 0.56, s * 0.08, 0, Math.PI * 2);
    ctx.fill();
  } else {
    if (src) {
      // water tower: tank on legs
      ctx.strokeStyle = '#2591c9';
      ctx.lineWidth = s * 0.05;
      ctx.beginPath();
      ctx.moveTo(s * 0.32, s * 0.5);
      ctx.lineTo(s * 0.26, s * 0.8);
      ctx.moveTo(s * 0.68, s * 0.5);
      ctx.lineTo(s * 0.74, s * 0.8);
      ctx.stroke();
      ctx.fillStyle = '#7dd3fc';
      roundRect(ctx, s * 0.22, s * 0.16, s * 0.56, s * 0.38, s * 0.14);
      ctx.fill();
      ctx.fillStyle = '#e0f6ff';
      ctx.fillRect(s * 0.3, s * 0.26, s * 0.4, s * 0.05);
    } else {
      // fountain in a small plaza
      ctx.fillStyle = '#b7f0d2';
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s * 0.36, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = lit ? '#5cc8ff' : '#d9e7ef';
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s * 0.24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s * 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
