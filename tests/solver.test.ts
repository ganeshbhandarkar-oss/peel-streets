import { describe, expect, it } from 'vitest';
import { applyMove, isSolved, parseLevel } from '../src/engine/grid';
import { solve } from '../src/engine/solver';
import { LEVELS, SOLUTIONS } from '../src/levels';
import type { LevelData } from '../src/engine/types';

const lvl = (rows: string[]): LevelData => ({ id: 0, name: 't', district: 0, par: 0, moves: 9, rows });

describe('solver', () => {
  it('finds a one-move rotate-in-place solution', () => {
    const r = solve(parseLevel(lvl(['S:r:E rI0 D:r:W'])));
    expect(r.solvable).toBe(true);
    expect(r.par).toBe(1);
  });

  it('needs a flip for rigid corners', () => {
    // (1,1) needs N+E; the stiff sticker shows W+N and can only be mirrored
    const r = solve(parseLevel(lvl(['#  S:r:S  #    #', '#  rL3!   rI1  D:r:W'])));
    expect(r.solvable).toBe(true);
    expect(r.par).toBe(1);
  });

  it('reports impossible puzzles', () => {
    const r = solve(parseLevel(lvl(['S:r:E rI0@ D:r:W'])));
    expect(r.solvable).toBe(false);
  });

  it('is optimal (BFS-equivalent) on a small swap puzzle', () => {
    // road and rail stickers are in each other's lines; one empty lot -> 3 moves
    const r = solve(parseLevel(lvl(['S:t:E rI1 D:t:W', '#     .   #', 'S:r:E tI1 D:r:W'])));
    expect(r.par).toBe(3);
  });
});

describe('levels', () => {
  it('has 24 levels in 3 districts of 8', () => {
    expect(LEVELS).toHaveLength(24);
    for (const d of [0, 1, 2]) expect(LEVELS.filter((l) => l.district === d)).toHaveLength(8);
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(24);
  });

  it('starts with a one-move tutorial with a finger hint', () => {
    expect(LEVELS[0].par).toBe(1);
    expect(LEVELS[0].hint).toBeDefined();
  });

  it.each(LEVELS.map((l) => [l.id, l] as const))('level %i: stored solution solves it in exactly par moves', (_id, l) => {
    let b = parseLevel(l);
    expect(isSolved(b)).toBe(false);
    const sol = SOLUTIONS[l.id];
    expect(sol).toHaveLength(l.par);
    for (const m of sol) b = applyMove(b, m);
    expect(isSolved(b)).toBe(true);
    expect(l.moves).toBeGreaterThan(l.par);
  });

  it.each(LEVELS.filter((l) => l.par <= 4).map((l) => [l.id, l] as const))('level %i: solver re-derives par', (_id, l) => {
    const r = solve(parseLevel(l));
    expect(r.solvable).toBe(true);
    expect(r.par).toBe(l.par);
  });
});
