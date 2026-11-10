import { describe, expect, it } from 'vitest';
import { FREE_UNDOS, GameSession, starsFor } from '../src/engine/game';
import { parseSegment } from '../src/engine/pieces';
import { LEVELS } from '../src/levels';
import { defaultProgress, isUnlocked, loadProgress, recordResult, resetProgress, saveProgress, totalStars, type KV } from '../src/meta/progress';

const level2 = LEVELS.find((l) => l.id === 2)!; // rotate (2,2) to horizontal

describe('GameSession', () => {
  it('counts peels, solves, and refuses no-op drops', () => {
    const g = new GameSession(level2);
    expect(g.place({ from: { r: 2, c: 2 }, to: { r: 2, c: 2 }, segments: [parseSegment('rI0')] }).kind).toBe('noop');
    expect(g.movesUsed).toBe(0);
    const r = g.place({ from: { r: 2, c: 2 }, to: { r: 2, c: 2 }, segments: [parseSegment('rI1')] });
    expect(r).toEqual({ kind: 'placed', solved: true, jammed: false });
    expect(g.status).toBe('won');
    expect(g.stars()).toBe(3);
  });

  it('jams when out of peels, and a mock ad un-jams with +3', () => {
    const g = new GameSession({ ...level2, moves: 1 });
    const r = g.place({ from: { r: 2, c: 2 }, to: { r: 2, c: 2 }, segments: [parseSegment('rD0')] });
    expect(r).toMatchObject({ jammed: true });
    expect(g.status).toBe('jammed');
    g.addPeels();
    expect(g.status).toBe('playing');
    expect(g.movesLeft).toBe(3);
  });

  it('undo refunds the peel and is limited without ads', () => {
    const g = new GameSession({ ...level2, moves: 10 });
    for (let i = 0; i < FREE_UNDOS + 1; i++) {
      g.place({ from: { r: 2, c: 2 }, to: { r: 2, c: 2 }, segments: [parseSegment(i % 2 ? 'rD0' : 'rD1')] });
    }
    expect(g.movesUsed).toBe(FREE_UNDOS + 1);
    for (let i = 0; i < FREE_UNDOS; i++) expect(g.undo()).toBe(true);
    expect(g.movesUsed).toBe(1);
    expect(g.undo()).toBe(false); // out of free undos
    expect(g.undo(true)).toBe(true); // via (mock) rewarded ad
    expect(g.movesUsed).toBe(0);
  });

  it('awards stars by peels vs par', () => {
    expect(starsFor(3, 3)).toBe(3);
    expect(starsFor(4, 3)).toBe(2);
    expect(starsFor(7, 3)).toBe(1);
  });
});

describe('progress', () => {
  const mem = (): KV => {
    const m = new Map<string, string>();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
  };

  it('saves, loads, keeps best stars and resets', () => {
    const kv = mem();
    const p = loadProgress(kv);
    expect(p).toEqual(defaultProgress());
    expect(recordResult(p, 1, 2)).toBe(true);
    expect(recordResult(p, 1, 1)).toBe(false);
    expect(recordResult(p, 1, 3)).toBe(true);
    p.sound = false;
    saveProgress(p, kv);
    const q = loadProgress(kv);
    expect(q.stars[1]).toBe(3);
    expect(totalStars(q)).toBe(3);
    const r = resetProgress(kv);
    expect(r.stars).toEqual({});
    expect(r.sound).toBe(false); // keeps the sound preference
  });

  it('unlocks levels in order', () => {
    const p = defaultProgress();
    const ids = [1, 2, 3];
    expect(isUnlocked(p, ids, 1)).toBe(true);
    expect(isUnlocked(p, ids, 2)).toBe(false);
    p.stars[1] = 1;
    expect(isUnlocked(p, ids, 2)).toBe(true);
  });

  it('survives corrupt storage', () => {
    const kv = mem();
    kv.setItem('peelstreets.progress.v1', '{nope');
    expect(loadProgress(kv)).toEqual(defaultProgress());
  });
});
