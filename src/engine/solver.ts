import { applyMove, cellAt, idx, isNoop, isSolved, pairsOf, topLayer, type Move, type PairInfo } from './grid';
import { dirDelta, maskFor, opposite, orientations } from './pieces';
import type { Board, Layer, Segment, Sticker } from './types';

/**
 * Breadth-first solver over peel moves.
 *
 * Key trick: a sticker that has been peeled at least once can be snapped in ANY of its legal
 * orientations, so the search state only tracks *where* every layer is plus a "moved" flag.
 * Orientation of moved, visible stickers is resolved lazily by a small backtracking path search
 * at win-check time. This shrinks the state space by roughly 4^k versus naive BFS while still
 * returning an optimal (minimum peel) solution. Every solution is replayed on the real board
 * to double-check it.
 */
export interface SolveResult {
  solvable: boolean;
  par: number;
  moves: Move[];
  explored: number;
  capped: boolean;
}

interface Ctx {
  b: Board;
  layers: Layer[]; // by id
  variants: Segment[][][]; // by id
  variable: boolean[]; // by id: orientation matters and can change
  ground: number[]; // indices of ground cells
  pairs: PairInfo[];
}

type State = { stacks: number[][]; moved: number };

const enc = (n: number) => String.fromCharCode(48 + n);

function key(s: State): string {
  let k = '';
  for (const st of s.stacks) {
    for (const id of st) k += enc(id);
    k += '|';
  }
  return k + s.moved.toString(36);
}

function decode(k: string, nGround: number): State {
  const parts = k.split('|');
  const stacks: number[][] = [];
  for (let i = 0; i < nGround; i++) {
    const p = parts[i];
    const st: number[] = [];
    for (let j = 0; j < p.length; j++) st.push(p.charCodeAt(j) - 48);
    stacks.push(st);
  }
  return { stacks, moved: parseInt(parts[nGround], 36) };
}

function buildCtx(b: Board): { ctx: Ctx; start: State } {
  const layers: Layer[] = [];
  const ground: number[] = [];
  const stacks: number[][] = [];
  // Re-number layer ids densely so they fit in the key alphabet and moved bitmask.
  for (let i = 0; i < b.cells.length; i++) {
    const c = b.cells[i];
    if (c.kind !== 'ground') continue;
    ground.push(i);
    stacks.push(
      c.stack.map((l) => {
        layers.push(l);
        return layers.length - 1;
      }),
    );
  }
  if (layers.length > 30) throw new Error('Solver supports at most 30 layers');
  const variants = layers.map((l) => (l.kind === 'sticker' ? orientations(l) : [[]]));
  const variable = layers.map((l, i) => l.kind === 'sticker' && !l.junk && variants[i].length > 1);
  return { ctx: { b, layers, variants, variable, ground, pairs: pairsOf(b) }, start: { stacks, moved: 0 } };
}

/** Does some orientation assignment for moved visible stickers connect every pair? */
function winAssignment(ctx: Ctx, s: State): Map<number, number> | null {
  const { b, pairs } = ctx;
  const topAt = new Int32Array(b.cells.length).fill(-1);
  ctx.ground.forEach((gi, k) => {
    const st = s.stacks[k];
    if (st.length) topAt[gi] = st[st.length - 1];
  });
  const assign = new Map<number, number>();
  const visited = pairs.map(() => new Uint8Array(b.cells.length));

  const segsOf = (id: number): Segment[] | null => {
    const l = ctx.layers[id];
    if (l.kind !== 'sticker') return null;
    if (ctx.variable[id] && s.moved & (1 << id)) {
      const a = assign.get(id);
      return a === undefined ? null : ctx.variants[id][a];
    }
    return (l as Sticker).segments;
  };

  const tryPair = (pi: number): boolean => {
    if (pi === pairs.length) return true;
    const p = pairs[pi];
    const [dr, dc] = dirDelta(p.sourceDir);
    return walk(p.source.r + dr, p.source.c + dc, opposite(p.sourceDir), pi);
  };

  const walk = (r: number, c: number, entry: number, pi: number): boolean => {
    if (r < 0 || c < 0 || r >= b.h || c >= b.w) return false;
    const i = idx(b, r, c);
    const vis = visited[pi];
    if (vis[i]) return false;
    const p = pairs[pi];
    const cell = b.cells[i];
    if (cell.kind === 'dest') {
      return cell.type === p.type && cell.pair === p.pair && cell.dir === entry ? tryPair(pi + 1) : false;
    }
    if (cell.kind !== 'ground') return false;
    const id = topAt[i];
    if (id < 0) return false;
    const go = (mask: number): boolean => {
      vis[i] = 1;
      for (const d of [1, 2, 4, 8]) {
        if (d === entry || !(mask & d)) continue;
        const [dr, dc] = dirDelta(d);
        if (walk(r + dr, c + dc, opposite(d), pi)) return true;
      }
      vis[i] = 0;
      return false;
    };
    const l = ctx.layers[id];
    if (l.kind !== 'sticker') return false;
    const free = ctx.variable[id] && s.moved & (1 << id) && !assign.has(id);
    if (free) {
      const vs = ctx.variants[id];
      for (let v = 0; v < vs.length; v++) {
        const m = maskFor(vs[v], p.type);
        if (!(m & entry)) continue;
        assign.set(id, v);
        if (go(m)) return true;
        assign.delete(id);
      }
      return false;
    }
    const segs = segsOf(id)!;
    const m = maskFor(segs, p.type);
    if (!(m & entry)) return false;
    return go(m);
  };

  return tryPair(0) ? assign : null;
}

/**
 * Admissible lower bound on the peels still needed.
 * For every pair we run Dijkstra over (cell, entry side). Crossing a cell is free when its current
 * top sticker already links entry -> exit (moved stickers may take any orientation). Otherwise the
 * cell must be fixed: a cell with a single layer (or empty) can only be fixed by snapping a sticker
 * onto it, and each move snaps exactly one sticker; a deeper stack might also be fixed by peeling
 * (revealing), and one move can do one snap + one reveal. So with p = snap-only fixes and q =
 * reveal-able fixes on the cheapest path, remaining >= max(p, ceil((p + q) / 2)).
 */
function lowerBound(ctx: Ctx, s: State): number {
  const { b } = ctx;
  const n = b.cells.length;
  const topAt = new Int32Array(n).fill(-1);
  const depth = new Int32Array(n);
  ctx.ground.forEach((gi, k) => {
    const st = s.stacks[k];
    depth[gi] = st.length;
    if (st.length) topAt[gi] = st[st.length - 1];
  });
  let best = 0;
  for (const p of ctx.pairs) {
    const a = pathCost(ctx, s, topAt, depth, p, false);
    if (a === Infinity) return Infinity;
    const c = pathCost(ctx, s, topAt, depth, p, true);
    best = Math.max(best, a, Math.ceil(c / 2));
  }
  return best;
}

const DIR_I: Record<number, number> = { 1: 0, 2: 1, 4: 2, 8: 3 };

/** countAll=false: count only snap-only fixes; true: count every fix. */
function pathCost(ctx: Ctx, s: State, topAt: Int32Array, depth: Int32Array, p: PairInfo, countAll: boolean): number {
  const { b } = ctx;
  const n = b.cells.length;
  const dist = new Float64Array(n * 4).fill(Infinity);
  // 0-1 BFS with a deque.
  const dq: number[] = [];
  const [sr, sc] = dirDelta(p.sourceDir);
  const r0 = p.source.r + sr;
  const c0 = p.source.c + sc;
  if (r0 < 0 || c0 < 0 || r0 >= b.h || c0 >= b.w) return Infinity;
  const e0 = opposite(p.sourceDir);
  const n0 = idx(b, r0, c0) * 4 + DIR_I[e0];
  dist[n0] = 0;
  dq.push(n0);
  let head = 0;
  const front: number[] = [];
  let best = Infinity;
  while (head < dq.length || front.length) {
    const node = front.length ? front.pop()! : dq[head++];
    const d = dist[node];
    const ci = node >> 2;
    const entry = 1 << (node & 3);
    const cell = b.cells[ci];
    if (cell.kind === 'dest') {
      if (cell.type === p.type && cell.pair === p.pair && cell.dir === entry) best = Math.min(best, d);
      continue;
    }
    if (cell.kind !== 'ground') continue;
    const id = topAt[ci];
    if (id >= 0 && ctx.layers[id].kind === 'rubble') continue;
    const r = Math.floor(ci / b.w);
    const c = ci % b.w;
    // what this cell links right now
    let linkMasks: number[] = [];
    if (id >= 0) {
      const l = ctx.layers[id] as Sticker;
      if (ctx.variable[id] && s.moved & (1 << id)) linkMasks = ctx.variants[id].map((v) => maskFor(v, p.type));
      else linkMasks = [maskFor(l.segments, p.type)];
    }
    const fixCost = depth[ci] >= 2 ? (countAll ? 1 : 0) : 1;
    for (const ex of [1, 2, 4, 8]) {
      if (ex === entry) continue;
      const ok = linkMasks.some((m) => (m & entry) && (m & ex));
      const w = ok ? 0 : fixCost;
      const [dr, dc] = dirDelta(ex);
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= b.h || nc >= b.w) continue;
      const nn = idx(b, nr, nc) * 4 + DIR_I[opposite(ex)];
      if (d + w < dist[nn]) {
        dist[nn] = d + w;
        if (w === 0) front.push(nn);
        else dq.push(nn);
      }
    }
  }
  return best;
}

export function solve(board: Board, opts: { maxStates?: number } = {}): SolveResult {
  const maxStates = opts.maxStates ?? 2_000_000;
  const { ctx, start } = buildCtx(board);
  const nG = ctx.ground.length;

  if (isSolved(board)) return { solvable: true, par: 0, moves: [], explored: 1, capped: false };

  // A* with integer buckets (f = g + h); within a bucket, deepest first.
  const bestG = new Map<string, number>();
  const parent: number[] = [];
  const moveOf: number[] = [];
  const gOf: number[] = [];
  const keys: string[] = [];
  const buckets: number[][] = [];
  const push = (k: string, g: number, h: number, par: number, mv: number) => {
    const ni = keys.length;
    keys.push(k);
    parent.push(par);
    moveOf.push(mv);
    gOf.push(g);
    (buckets[g + h] ??= []).push(ni);
  };
  const k0 = key(start);
  const h0 = lowerBound(ctx, start);
  if (h0 === Infinity) return { solvable: false, par: -1, moves: [], explored: 1, capped: false };
  bestG.set(k0, 0);
  push(k0, 0, h0, -1, -1);

  for (let f = 0; f < buckets.length || f < 200; f++) {
    const bucket = buckets[f];
    if (!bucket) {
      if (f >= buckets.length) break;
      continue;
    }
    while (bucket.length) {
      const si = bucket.pop()!;
      const g = gOf[si];
      if (bestG.get(keys[si])! < g) continue; // stale
      const s = decode(keys[si], nG);
      if (g > 0) {
        const assign = winAssignment(ctx, s);
        if (assign) {
          const moves = reconstruct(ctx, start, si, parent, moveOf, assign);
          return { solvable: true, par: g, moves, explored: keys.length, capped: false };
        }
      }
      for (let fk = 0; fk < nG; fk++) {
        const fst = s.stacks[fk];
        if (!fst.length) continue;
        const pid = fst[fst.length - 1];
        const layer = ctx.layers[pid];
        if (layer.kind !== 'sticker' || layer.pinned) continue;
        for (let tk = 0; tk < nG; tk++) {
          if (tk === fk) {
            if (!ctx.variable[pid]) continue; // dropping back unchanged is a no-op
          } else if (s.stacks[tk].length) continue;
          const stacks = s.stacks.slice();
          stacks[fk] = fst.slice(0, -1);
          stacks[tk] = (tk === fk ? stacks[fk] : s.stacks[tk]).concat(pid);
          const ns: State = { stacks, moved: ctx.variable[pid] ? s.moved | (1 << pid) : s.moved };
          const k = key(ns);
          const prev = bestG.get(k);
          if (prev !== undefined && prev <= g + 1) continue;
          const h = lowerBound(ctx, ns);
          if (h === Infinity) continue;
          bestG.set(k, g + 1);
          push(k, g + 1, h, si, fk * 256 + tk);
          if (keys.length >= maxStates) return { solvable: false, par: -1, moves: [], explored: keys.length, capped: true };
        }
      }
    }
  }
  return { solvable: false, par: -1, moves: [], explored: keys.length, capped: false };
}

function reconstruct(ctx: Ctx, start: State, end: number, parent: number[], moveOf: number[], assign: Map<number, number>): Move[] {
  const chain: number[] = [];
  for (let at = end; at > 0; at = parent[at]) chain.unshift(moveOf[at]);
  // Replay on a real board, choosing orientations: the last placement of each sticker uses the
  // solved orientation; earlier (temporary) placements keep the sticker as-is.
  const lastMoveOf = new Map<number, number>();
  const st = start.stacks.map((x) => x.slice());
  const pidAt: number[] = [];
  chain.forEach((mv, i) => {
    const fk = mv >> 8;
    const tk = mv & 255;
    const pid = st[fk].pop()!;
    st[tk].push(pid);
    pidAt.push(pid);
    lastMoveOf.set(pid, i);
  });
  let b = ctx.b;
  const moves: Move[] = [];
  chain.forEach((mv, i) => {
    const fk = mv >> 8;
    const tk = mv & 255;
    const pid = pidAt[i];
    const fromI = ctx.ground[fk];
    const toI = ctx.ground[tk];
    const from = { r: Math.floor(fromI / b.w), c: fromI % b.w };
    const to = { r: Math.floor(toI / b.w), c: toI % b.w };
    const cur = topLayer(cellAt(b, from)) as Sticker;
    let segments = cur.segments;
    if (lastMoveOf.get(pid) === i && assign.has(pid)) segments = ctx.variants[pid][assign.get(pid)!];
    else if (from.r === to.r && from.c === to.c) segments = ctx.variants[pid].find((v) => v !== cur.segments && JSON.stringify(v) !== JSON.stringify(cur.segments)) ?? segments;
    const m: Move = { from, to, segments };
    if (isNoop(b, m)) {
      // Rotating in place to the same orientation is free in the game; skip it.
      return;
    }
    b = applyMove(b, m);
    moves.push(m);
  });
  return moves;
}

/** Convenience used by the hint button: first optimal move from the current board. */
export function nextHint(board: Board, maxStates = 120_000): Move | null {
  const r = solve(board, { maxStates });
  return r.solvable && r.moves.length ? r.moves[0] : null;
}
