import { describe, expect, it } from 'vitest';
import { flipMask, orientations, parseSegment, rotateMask, SHAPE_MASK } from '../src/engine/pieces';
import { E, N, S, W, type Sticker } from '../src/engine/types';

const st = (code: string, rigid = false): Sticker => ({ kind: 'sticker', id: 0, segments: code.split('+').map(parseSegment), rigid, pinned: false, junk: false });

describe('pieces', () => {
  it('rotates masks clockwise', () => {
    expect(rotateMask(N)).toBe(E);
    expect(rotateMask(W)).toBe(N);
    expect(rotateMask(N | E, 1)).toBe(E | S);
    expect(rotateMask(N | E, 4)).toBe(N | E);
    expect(rotateMask(N | S, 1)).toBe(E | W);
  });

  it('flips masks left/right', () => {
    expect(flipMask(N | E)).toBe(N | W);
    expect(flipMask(N | S)).toBe(N | S);
    expect(flipMask(E)).toBe(W);
  });

  it('parses segment codes with rotation', () => {
    expect(parseSegment('rI0')).toEqual({ type: 'road', mask: N | S });
    expect(parseSegment('tL2')).toEqual({ type: 'rail', mask: S | W });
    expect(parseSegment('pT0').mask).toBe(SHAPE_MASK.T);
    expect(() => parseSegment('qZ9')).toThrow();
  });

  it('counts distinct orientations', () => {
    expect(orientations(st('rI0'))).toHaveLength(2);
    expect(orientations(st('rL0'))).toHaveLength(4);
    expect(orientations(st('rT0'))).toHaveLength(4);
    expect(orientations(st('rX'))).toHaveLength(1);
    expect(orientations(st('rD0'))).toHaveLength(4);
    // rigid: only as-is or flipped
    expect(orientations(st('rL0', true))).toHaveLength(2);
    expect(orientations(st('rI1', true))).toHaveLength(1);
    // bridge: road N-S over rail E-W has 2 distinct orientations
    expect(orientations(st('rI0+tI1'))).toHaveLength(2);
  });
});
