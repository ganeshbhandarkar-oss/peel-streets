import { describe, expect, it } from 'vitest';
import { applyMove, canPlace, cellAt, findPath, isNoop, isPeelable, isSolved, pairsOf, parseLevel } from '../src/engine/grid';
import { parseSegment } from '../src/engine/pieces';
import type { LevelData } from '../src/engine/types';

const lvl = (rows: string[]): LevelData => ({ id: 0, name: 't', district: 0, par: 0, moves: 9, rows });

describe('grid', () => {
  it('parses sources, destinations, stacks and flags', () => {
    const b = parseLevel(lvl(['S:r:E  rI1/j  rL0!@  x/rI0  D:r:W']));
    expect(b.w).toBe(5);
    expect(b.cells[0]).toMatchObject({ kind: 'source', type: 'road' });
    expect(b.cells[1].stack).toHaveLength(2);
    expect(b.cells[1].stack[1]).toMatchObject({ kind: 'sticker', junk: true });
    expect(b.cells[2].stack[0]).toMatchObject({ rigid: true, pinned: true });
    expect(b.cells[3].stack[0].kind).toBe('rubble');
    expect(pairsOf(b)).toHaveLength(1);
  });

  it('rejects malformed rows', () => {
    expect(() => parseLevel(lvl(['S:r:E .', '. . .']))).toThrow();
  });

  it('detects connections by type', () => {
    expect(isSolved(parseLevel(lvl(['S:r:E rI1 rI1 D:r:W'])))).toBe(true);
    expect(isSolved(parseLevel(lvl(['S:r:E rI1 rI0 D:r:W'])))).toBe(false);
    // wrong type does not connect
    expect(isSolved(parseLevel(lvl(['S:r:E rI1 tI1 D:r:W'])))).toBe(false);
    // bridge carries both
    expect(isSolved(parseLevel(lvl(['#     S:r:S    #', 'S:t:E rI0+tI1 D:t:W', '#     D:r:N    #'])))).toBe(true);
  });

  it('returns the path cells source -> destination', () => {
    const b = parseLevel(lvl(['S:r:E rI1 rL2', '#     #   D:r:N']));
    const p = findPath(b, pairsOf(b)[0])!;
    expect(p.map((x) => [x.r, x.c])).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 2],
    ]);
  });

  it('enforces peel / place rules', () => {
    const b = parseLevel(lvl(['S:r:E rI0@ rI0 . x/rI1 D:r:W']));
    expect(isPeelable(b, { r: 0, c: 1 })).toBe(false); // pinned
    expect(isPeelable(b, { r: 0, c: 2 })).toBe(true);
    expect(isPeelable(b, { r: 0, c: 4 })).toBe(true); // sticker over rubble
    expect(isPeelable(b, { r: 0, c: 0 })).toBe(false); // source
    expect(canPlace(b, { r: 0, c: 2 }, { r: 0, c: 3 })).toBe(true); // empty lot
    expect(canPlace(b, { r: 0, c: 2 }, { r: 0, c: 1 })).toBe(false); // occupied
    expect(canPlace(b, { r: 0, c: 2 }, { r: 0, c: 2 })).toBe(true); // back onto itself
    const nb = applyMove(b, { from: { r: 0, c: 4 }, to: { r: 0, c: 3 }, segments: [parseSegment('rI1')] });
    expect(cellAt(nb, { r: 0, c: 4 }).stack[0].kind).toBe('rubble');
    expect(isPeelable(nb, { r: 0, c: 4 })).toBe(false); // revealed rubble
    expect(canPlace(nb, { r: 0, c: 2 }, { r: 0, c: 4 })).toBe(false); // rubble takes nothing
    // original board untouched (immutable updates)
    expect(cellAt(b, { r: 0, c: 4 }).stack).toHaveLength(2);
  });

  it('treats dropping a sticker back unchanged as a no-op', () => {
    const b = parseLevel(lvl(['S:r:E rI0 D:r:W']));
    expect(isNoop(b, { from: { r: 0, c: 1 }, to: { r: 0, c: 1 }, segments: [parseSegment('rI0')] })).toBe(true);
    expect(isNoop(b, { from: { r: 0, c: 1 }, to: { r: 0, c: 1 }, segments: [parseSegment('rI1')] })).toBe(false);
  });
});
