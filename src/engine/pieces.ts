import { DIRS, E, N, S, W, type PathType, type Segment, type Shape, type Sticker } from './types';

export const SHAPE_MASK: Record<Shape, number> = {
  I: N | S,
  L: N | E,
  T: N | E | W,
  X: N | E | S | W,
  D: N,
};

export const TYPE_CODE: Record<string, PathType> = { r: 'road', t: 'rail', p: 'pipe' };
export const CODE_OF_TYPE: Record<PathType, string> = { road: 'r', rail: 't', pipe: 'p' };

/** Rotate a mask 90 degrees clockwise `times` times. */
export function rotateMask(mask: number, times = 1): number {
  let m = mask & 15;
  for (let i = 0; i < ((times % 4) + 4) % 4; i++) {
    m = ((m << 1) | (m >> 3)) & 15;
  }
  return m;
}

/** Mirror a mask left/right (swap E and W). */
export function flipMask(mask: number): number {
  let m = mask & (N | S);
  if (mask & E) m |= W;
  if (mask & W) m |= E;
  return m;
}

export function opposite(d: number): number {
  return rotateMask(d, 2);
}

export function maskHas(mask: number, d: number): boolean {
  return (mask & d) !== 0;
}

export function dirDelta(d: number): [number, number] {
  switch (d) {
    case N:
      return [-1, 0];
    case E:
      return [0, 1];
    case S:
      return [1, 0];
    default:
      return [0, -1];
  }
}

export function dirFromLetter(ch: string): number {
  const m: Record<string, number> = { N, E, S, W };
  const d = m[ch.toUpperCase()];
  if (!d) throw new Error(`Bad direction "${ch}"`);
  return d;
}

export function segmentsRotate(segs: Segment[], times = 1): Segment[] {
  return segs.map((s) => ({ type: s.type, mask: rotateMask(s.mask, times) }));
}

export function segmentsFlip(segs: Segment[]): Segment[] {
  return segs.map((s) => ({ type: s.type, mask: flipMask(s.mask) }));
}

export function segmentsKey(segs: Segment[]): string {
  return segs
    .map((s) => CODE_OF_TYPE[s.type] + s.mask.toString(16))
    .sort()
    .join('+');
}

export function maskFor(segs: Segment[], type: PathType): number {
  let m = 0;
  for (const s of segs) if (s.type === type) m |= s.mask;
  return m;
}

/**
 * All distinct orientations a sticker can be snapped in.
 * Normal stickers: 4 rotations x optional flip. Rigid stickers: as-is or flipped.
 */
export function orientations(st: Sticker): Segment[][] {
  const out: Segment[][] = [];
  const seen = new Set<string>();
  const push = (s: Segment[]) => {
    const k = segmentsKey(s);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(s);
    }
  };
  if (st.junk || st.segments.length === 0) return [st.segments];
  if (st.rigid) {
    push(st.segments);
    push(segmentsFlip(st.segments));
  } else {
    for (const f of [false, true]) {
      const base = f ? segmentsFlip(st.segments) : st.segments;
      for (let r = 0; r < 4; r++) push(segmentsRotate(base, r));
    }
  }
  return out;
}

/** Parse one segment code like "rL2" (road corner rotated twice). */
export function parseSegment(code: string): Segment {
  const m = /^([rtp])([ILTXD])([0-3]?)$/.exec(code);
  if (!m) throw new Error(`Bad segment code "${code}"`);
  const type = TYPE_CODE[m[1]];
  const mask = rotateMask(SHAPE_MASK[m[2] as Shape], Number(m[3] || 0));
  return { type, mask };
}

export { DIRS };
