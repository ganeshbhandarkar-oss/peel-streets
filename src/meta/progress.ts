export interface Progress {
  stars: Record<number, number>;
  sound: boolean;
  seenTips: number[];
}

const KEY = 'peelstreets.progress.v1';

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

const memory = new Map<string, string>();
const memKV: KV = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => void memory.set(k, v),
  removeItem: (k) => void memory.delete(k),
};

function store(): KV {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* private mode */
  }
  return memKV;
}

export const defaultProgress = (): Progress => ({ stars: {}, sound: true, seenTips: [] });

export function loadProgress(kv: KV = store()): Progress {
  try {
    const raw = kv.getItem(KEY);
    if (!raw) return defaultProgress();
    const p = JSON.parse(raw);
    return { ...defaultProgress(), ...p, stars: { ...(p.stars || {}) } };
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(p: Progress, kv: KV = store()) {
  kv.setItem(KEY, JSON.stringify(p));
}

export function resetProgress(kv: KV = store()): Progress {
  const p = defaultProgress();
  p.sound = loadProgress(kv).sound;
  saveProgress(p, kv);
  return p;
}

/** Record a result, keeping the best star count. Returns true if it improved. */
export function recordResult(p: Progress, levelId: number, stars: number): boolean {
  const prev = p.stars[levelId] ?? 0;
  if (stars > prev) {
    p.stars[levelId] = stars;
    return true;
  }
  return false;
}

/** Levels unlock in order: a level is open if it's the first or the previous one is solved. */
export function isUnlocked(p: Progress, levelIds: number[], id: number): boolean {
  const i = levelIds.indexOf(id);
  if (i <= 0) return true;
  return (p.stars[levelIds[i - 1]] ?? 0) > 0;
}

export function totalStars(p: Progress): number {
  return Object.values(p.stars).reduce((a, b) => a + b, 0);
}
