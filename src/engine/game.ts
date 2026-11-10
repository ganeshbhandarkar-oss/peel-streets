import { applyMove, isNoop, isSolved, parseLevel, type Move } from './grid';
import type { Board, LevelData } from './types';

export type PlaceResult = { kind: 'noop' } | { kind: 'placed'; solved: boolean; jammed: boolean };

export const FREE_UNDOS = 3;
export const AD_BONUS_PEELS = 3;

/** One play session of a level: board, peel budget, undo history. Pure logic, no DOM. */
export class GameSession {
  readonly level: LevelData;
  board: Board;
  movesUsed = 0;
  budget: number;
  undosLeft = FREE_UNDOS;
  history: { board: Board; movesUsed: number }[] = [];
  status: 'playing' | 'won' | 'jammed' = 'playing';

  constructor(level: LevelData) {
    this.level = level;
    this.board = parseLevel(level);
    this.budget = level.moves;
  }

  get movesLeft() {
    return this.budget - this.movesUsed;
  }

  place(m: Move): PlaceResult {
    if (this.status !== 'playing') return { kind: 'noop' };
    if (isNoop(this.board, m)) return { kind: 'noop' };
    this.history.push({ board: this.board, movesUsed: this.movesUsed });
    this.board = applyMove(this.board, m);
    this.movesUsed++;
    const solved = isSolved(this.board);
    const jammed = !solved && this.movesLeft <= 0;
    this.status = solved ? 'won' : jammed ? 'jammed' : 'playing';
    return { kind: 'placed', solved, jammed };
  }

  canUndo() {
    return this.history.length > 0 && this.status !== 'won';
  }

  /** Undo refunds the peel. Free undos are limited; after that the UI gates undo behind a mock ad. */
  undo(viaAd = false): boolean {
    if (!this.canUndo()) return false;
    if (!viaAd) {
      if (this.undosLeft <= 0) return false;
      this.undosLeft--;
    }
    const prev = this.history.pop()!;
    this.board = prev.board;
    this.movesUsed = prev.movesUsed;
    this.status = 'playing';
    return true;
  }

  /** Mock rewarded ad: +3 peels; un-jams the level. */
  addPeels(n = AD_BONUS_PEELS) {
    this.budget += n;
    if (this.status === 'jammed') this.status = 'playing';
  }

  stars(): number {
    return starsFor(this.movesUsed, this.level.par);
  }
}

/** 3 stars at par, 2 stars within par+1, otherwise 1 (any solve earns at least 1). */
export function starsFor(movesUsed: number, par: number): number {
  if (movesUsed <= par) return 3;
  if (movesUsed <= par + 1) return 2;
  return 1;
}

/** Stable key of a board's contents (used to match the board against stored solutions). */
export function boardKey(b: Board): string {
  return b.cells
    .map((c) =>
      c.stack
        .map((l) => (l.kind === 'sticker' ? `${l.id}:${l.segments.map((s) => s.type[0] + s.mask).sort().join('+')}` : `x${l.id}`))
        .join(','),
    )
    .join('|');
}
