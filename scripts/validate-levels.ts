/**
 * Level validator: parses every level, runs the BFS solver, replays the solution on the real
 * board, and checks par / move budget / difficulty curve. Exit code 1 on any failure.
 *   npm run validate            # check
 *   npm run validate -- --write # also rewrite "par" in levels.json from the solver
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { applyMove, isSolved, parseLevel } from '../src/engine/grid';
import { solve } from '../src/engine/solver';
import type { LevelData } from '../src/engine/types';

const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, '../src/levels/levels.json');
const levels: LevelData[] = JSON.parse(readFileSync(file, 'utf8'));
const write = process.argv.includes('--write');
const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1];

let failures = 0;
const solutions: Record<string, unknown> = {};

/** Keep levels.json hand-editable: one key per line, each row on its own line. */
function formatLevels(ls: LevelData[]): string {
  const blocks = ls.map((l) => {
    const { rows, ...rest } = l;
    const head = JSON.stringify(rest).slice(1, -1).replace(/,"/g, ', "');
    return `  {${head},\n   "rows": [\n${rows.map((r) => '     ' + JSON.stringify(r)).join(',\n')}\n   ]}`;
  });
  return `[\n${blocks.join(',\n')}\n]\n`;
}
const fail = (msg: string) => {
  failures++;
  console.log(`  FAIL ${msg}`);
};

console.log('id  district  par  budget  explored  time   name');
for (const lv of levels) {
  if (only && String(lv.id) !== only) continue;
  const t0 = performance.now();
  let board;
  try {
    board = parseLevel(lv);
  } catch (e) {
    fail(`level ${lv.id}: parse error ${(e as Error).message}`);
    continue;
  }
  if (isSolved(board)) fail(`level ${lv.id} is already solved at start`);
  const res = solve(board, { maxStates: 2_500_000 });
  const ms = (performance.now() - t0).toFixed(0);
  console.log(
    `${String(lv.id).padStart(2)}  ${lv.district}         ${String(res.par).padStart(2)}   ${String(lv.moves).padStart(3)}    ${String(res.explored).padStart(8)}  ${ms.padStart(5)}ms ${lv.name}`,
  );
  if (!res.solvable) {
    fail(`level ${lv.id} NOT solvable${res.capped ? ' (state cap hit)' : ''}`);
    continue;
  }
  // Replay the solution on the real board.
  let b = board;
  for (const m of res.moves) b = applyMove(b, m);
  if (!isSolved(b)) fail(`level ${lv.id}: replayed solution does not solve the board`);
  if (res.moves.length !== res.par) fail(`level ${lv.id}: solution length ${res.moves.length} != par ${res.par}`);
  solutions[lv.id] = res.moves;
  if (write) lv.par = res.par;
  else if (lv.par !== res.par) fail(`level ${lv.id}: levels.json par ${lv.par} but solver says ${res.par} (run with --write)`);
  if (lv.moves < res.par) fail(`level ${lv.id}: move budget ${lv.moves} < par ${res.par}`);
  if (process.argv.includes('--verbose')) {
    for (const m of res.moves) console.log(`      (${m.from.r},${m.from.c}) -> (${m.to.r},${m.to.c}) ${JSON.stringify(m.segments)}`);
  }
}

if (write) {
  writeFileSync(file, formatLevels(levels));
  writeFileSync(join(here, '../src/levels/solutions.json'), JSON.stringify(solutions) + '\n');
  console.log('levels.json par values updated');
}
console.log(failures ? `\n${failures} problem(s) found` : `\nAll ${levels.length} levels verified solvable.`);
process.exit(failures ? 1 : 0);
