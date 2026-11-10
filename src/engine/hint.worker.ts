/// <reference lib="webworker" />
import { solve } from './solver';
import type { Board } from './types';

// Off-thread hint search so the UI never freezes on big late-game boards.
self.onmessage = (e: MessageEvent<{ board: Board; maxStates: number }>) => {
  const r = solve(e.data.board, { maxStates: e.data.maxStates });
  (self as unknown as Worker).postMessage(r.solvable && r.moves.length ? r.moves[0] : null);
};
