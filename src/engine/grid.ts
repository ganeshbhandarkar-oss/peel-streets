import { dirDelta, dirFromLetter, maskFor, opposite, parseSegment, segmentsKey, TYPE_CODE } from './pieces';
import { DIRS, type Board, type Cell, type Layer, type LevelData, type PathType, type Pos, type Segment, type Sticker } from './types';

/**
 * Level token grammar (one token per cell, whitespace separated):
 *   .            empty ground (a sticker can be snapped here)
 *   #            city block / decor (never playable)
 *   S:r:E[:n]    source of type r|t|p (road garage, tram depot, water tower) opening East; optional pair n
 *   D:r:W[:n]    destination of that type opening West
 *   a/b/c        a stack of layers on ground, bottom -> top. Each layer is one of:
 *                  rI1, tL2, pX ...   sticker segment: type + shape (I,L,T,X,D) + clockwise rotation
 *                  rI0+tI1            multi-type sticker (bridge)
 *                  j                  junk sticker (litter, no path)
 *                  x                  rubble (unpeelable; the tile can never take a sticker)
 *                suffix ! = rigid (flip only, no rotate), @ = pinned (cannot be peeled)
 */
export function parseLevel(data: LevelData): Board {
  const rows = data.rows.map((r) => r.trim().split(/\s+/));
  const h = rows.length;
  const w = rows[0].length;
  let nextId = 0;
  const cells: Cell[] = [];
  rows.forEach((row, ri) => {
    if (row.length !== w) throw new Error(`Level ${data.id}: row ${ri} has ${row.length} cells, expected ${w}`);
    for (const tok of row) cells.push(parseToken(tok, () => nextId++, data.id));
  });
  return { w, h, cells };
}

function parseToken(tok: string, id: () => number, levelId: number): Cell {
  if (tok === '.') return { kind: 'ground', stack: [] };
  if (tok === '#') return { kind: 'block', stack: [] };
  if (tok.startsWith('S:') || tok.startsWith('D:')) {
    const [k, t, d, p] = tok.split(':');
    const type = TYPE_CODE[t];
    if (!type) throw new Error(`Level ${levelId}: bad type in ${tok}`);
    return { kind: k === 'S' ? 'source' : 'dest', stack: [], type, dir: dirFromLetter(d), pair: Number(p || 0) };
  }
  const stack: Layer[] = tok.split('/').map((code) => parseLayer(code, id(), levelId));
  return { kind: 'ground', stack };
}

function parseLayer(code: string, id: number, levelId: number): Layer {
  let c = code;
  let rigid = false;
  let pinned = false;
  while (c.endsWith('!') || c.endsWith('@')) {
    if (c.endsWith('!')) rigid = true;
    else pinned = true;
    c = c.slice(0, -1);
  }
  if (c === 'x') return { kind: 'rubble', id };
  if (c === 'j') return { kind: 'sticker', id, segments: [], rigid: false, pinned, junk: true };
  try {
    const segments = c.split('+').map(parseSegment);
    return { kind: 'sticker', id, segments, rigid, pinned, junk: false };
  } catch (e) {
    throw new Error(`Level ${levelId}: ${(e as Error).message}`);
  }
}

export const idx = (b: Board, r: number, c: number) => r * b.w + c;
export const inBounds = (b: Board, r: number, c: number) => r >= 0 && c >= 0 && r < b.h && c < b.w;
export const cellAt = (b: Board, p: Pos) => b.cells[idx(b, p.r, p.c)];

export function topLayer(cell: Cell): Layer | undefined {
  return cell.stack[cell.stack.length - 1];
}

export function cloneBoard(b: Board): Board {
  return {
    w: b.w,
    h: b.h,
    cells: b.cells.map((c) => ({ ...c, stack: c.stack.map((l) => (l.kind === 'sticker' ? { ...l, segments: l.segments.map((s) => ({ ...s })) } : { ...l })) })),
  };
}

export function isPeelable(b: Board, p: Pos): boolean {
  if (!inBounds(b, p.r, p.c)) return false;
  const cell = cellAt(b, p);
  if (cell.kind !== 'ground') return false;
  const t = topLayer(cell);
  return !!t && t.kind === 'sticker' && !t.pinned;
}

/** Can a sticker peeled from `from` be snapped onto `to`? (Empty ground, or back onto its own tile.) */
export function canPlace(b: Board, from: Pos, to: Pos): boolean {
  if (!inBounds(b, to.r, to.c)) return false;
  if (from.r === to.r && from.c === to.c) return true;
  const cell = cellAt(b, to);
  return cell.kind === 'ground' && cell.stack.length === 0;
}

export interface Move {
  from: Pos;
  to: Pos;
  segments: Segment[];
}

/** Returns a new board with the move applied. Throws if illegal. */
export function applyMove(b: Board, m: Move): Board {
  if (!isPeelable(b, m.from)) throw new Error('Nothing peelable at source');
  if (!canPlace(b, m.from, m.to)) throw new Error('Cannot place there');
  const nb = cloneBoard(b);
  const st = cellAt(nb, m.from).stack.pop() as Sticker;
  st.segments = m.segments.map((s) => ({ ...s }));
  cellAt(nb, m.to).stack.push(st);
  return nb;
}

/** True when the move would change nothing (dropped back on its own tile unchanged). */
export function isNoop(b: Board, m: Move): boolean {
  if (m.from.r !== m.to.r || m.from.c !== m.to.c) return false;
  const t = topLayer(cellAt(b, m.from));
  return !!t && t.kind === 'sticker' && segmentsKey(t.segments) === segmentsKey(m.segments);
}

/** Connection mask of a cell for one path type. */
export function cellMask(b: Board, r: number, c: number, type: PathType): number {
  const cell = b.cells[idx(b, r, c)];
  if (cell.kind === 'source' || cell.kind === 'dest') return cell.type === type ? (cell.dir as number) : 0;
  if (cell.kind !== 'ground') return 0;
  const t = topLayer(cell);
  if (!t || t.kind !== 'sticker') return 0;
  return maskFor(t.segments, type);
}

export interface PairInfo {
  type: PathType;
  pair: number;
  source: Pos;
  dest: Pos;
  sourceDir: number;
  destDir: number;
}

export function pairsOf(b: Board): PairInfo[] {
  const out: PairInfo[] = [];
  for (let i = 0; i < b.cells.length; i++) {
    const s = b.cells[i];
    if (s.kind !== 'source') continue;
    const di = b.cells.findIndex((d) => d.kind === 'dest' && d.type === s.type && d.pair === s.pair);
    if (di < 0) throw new Error(`Source at ${i} has no destination`);
    out.push({
      type: s.type!,
      pair: s.pair!,
      source: { r: Math.floor(i / b.w), c: i % b.w },
      dest: { r: Math.floor(di / b.w), c: di % b.w },
      sourceDir: s.dir!,
      destDir: b.cells[di].dir!,
    });
  }
  return out;
}

/** BFS along one path type from the source. Returns the cell path to the destination, or null. */
export function findPath(b: Board, p: PairInfo): Pos[] | null {
  const start = idx(b, p.source.r, p.source.c);
  const goal = idx(b, p.dest.r, p.dest.c);
  const prev = new Int32Array(b.cells.length).fill(-2);
  prev[start] = -1;
  const q = [start];
  while (q.length) {
    const cur = q.shift()!;
    if (cur === goal) break;
    const r = Math.floor(cur / b.w);
    const c = cur % b.w;
    const m = cellMask(b, r, c, p.type);
    // Never route *through* another endpoint.
    if (cur !== start && b.cells[cur].kind !== 'ground') continue;
    for (const d of DIRS) {
      if (!(m & d)) continue;
      const [dr, dc] = dirDelta(d);
      const nr = r + dr;
      const nc = c + dc;
      if (!inBounds(b, nr, nc)) continue;
      const ni = idx(b, nr, nc);
      if (prev[ni] !== -2) continue;
      if (!(cellMask(b, nr, nc, p.type) & opposite(d))) continue;
      prev[ni] = cur;
      q.push(ni);
    }
  }
  if (prev[goal] === -2) return null;
  const path: Pos[] = [];
  for (let at = goal; at !== -1; at = prev[at]) path.unshift({ r: Math.floor(at / b.w), c: at % b.w });
  return path;
}

export function isSolved(b: Board): boolean {
  return pairsOf(b).every((p) => findPath(b, p) !== null);
}
