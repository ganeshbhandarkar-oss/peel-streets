/**
 * Browser smoke test (needs `npm run preview` on :4173):
 *  - plays every level through the real placement path using the verified solutions
 *  - drags a sticker with the mouse to check peel -> lift -> snap input
 *  - checks hint, mock ad (+3 peels), undo, settings/level select and localStorage progress
 */
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL || 'http://localhost:4173/peel-streets/';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let fails = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`);
  if (!ok) fails++;
};
const center = (r, c) =>
  page.evaluate(([r, c]) => {
    const b = document.getElementById('board').getBoundingClientRect();
    const [x, y] = window.__view.center({ r, c });
    return [b.left + x, b.top + y];
  }, [r, c]);

await page.goto(BASE + '?unlock=1');
const levels = await page.evaluate(() => window.peelDebug.levels());
for (const l of levels) {
  await page.evaluate((id) => window.peelDebug.play(id), l.id);
  await page.evaluate(() => window.peelDebug.solve(0));
  const st = await page.evaluate(() => window.peelDebug.state());
  check(st.status === 'won' && st.used === l.par, `level ${l.id} "${l.name}" solved in ${st.used} (par ${l.par})`);
}

// Real mouse drag on level 1: peel (1,2) and drop on (2,2)
await page.goto(BASE + '?level=1');
await page.waitForTimeout(300);
const [fx, fy] = await center(1, 2);
const [tx, ty] = await center(2, 2);
await page.mouse.move(fx + 15, fy + 15);
await page.mouse.down();
await page.mouse.move(fx - 40, fy - 40, { steps: 8 });
await page.mouse.move(tx, ty, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(200);
let st = await page.evaluate(() => window.peelDebug.state());
check(st.status === 'won', 'mouse drag-peel-snap solves level 1');
await page.waitForTimeout(2200);
check(await page.isVisible('.modal-back.win'), 'win popup shows');
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('peelstreets.progress.v1')).stars['1']);
check(saved === 3, 'progress saved to localStorage with 3 stars');

// Tap-peel, rotate button, tap back (level 2)
await page.goto(BASE + '?level=2&unlock=1');
await page.waitForTimeout(300);
const [ax, ay] = await center(2, 2);
await page.mouse.click(ax, ay);
await page.waitForTimeout(350);
check(await page.isVisible('#heldbar'), 'held toolbar appears after tap-peel');
await page.click('[data-act="rotate"]');
await page.mouse.click(ax, ay);
await page.waitForTimeout(200);
st = await page.evaluate(() => window.peelDebug.state());
check(st.status === 'won' && st.used === 1, 'tap, rotate, tap-back solves level 2 in 1 peel');

// Hint, ad, undo on level 8
await page.goto(BASE + '?level=8&unlock=1');
await page.waitForTimeout(300);
await page.click('[data-act="hint"]');
await page.waitForTimeout(150);
check(await page.evaluate(() => !!window.__view.hint), 'hint shows a suggested move');
await page.click('[data-act="ad-peels"]');
check(await page.isVisible('.mock-ad'), 'mock rewarded ad modal shows');
await page.waitForTimeout(3000);
st = await page.evaluate(() => window.peelDebug.state());
check(st.left === 9, 'mock ad grants +3 peels (6 -> 9)');
await page.evaluate(() => window.peelDebug.step());
await page.click('[data-act="undo"]');
st = await page.evaluate(() => window.peelDebug.state());
check(st.used === 0, 'undo refunds the peel');

// Off-line hint uses the worker solver (level 20, after a detour move)
await page.goto(BASE + '?level=20&unlock=1');
await page.waitForTimeout(300);
await page.evaluate(() => {
  const s = window.__app.session;
  // move the junk from (2,4) to the empty lot (4,1): not on the stored line
  window.__app.place({ from: { r: 2, c: 4 }, to: { r: 4, c: 1 }, segments: [] }, 0, 0);
});
await page.click('[data-act="hint"]');
await page.waitForFunction(() => !!window.__view.hint, null, { timeout: 9000 }).catch(() => {});
check(await page.evaluate(() => !!window.__view.hint), 'off-line hint found by worker solver');

// Settings + level select
await page.click('[data-act="map"]');
await page.click('[data-act="settings"]');
check((await page.locator('.level-grid .ls').count()) === 24, 'level select lists 24 levels');
await page.click('[data-act="sound"]');
const snd = await page.evaluate(() => JSON.parse(localStorage.getItem('peelstreets.progress.v1')).sound);
check(snd === false, 'sound toggle persists');

check(errors.length === 0, `no page errors ${errors.join(' | ')}`);
await browser.close();
console.log(fails ? `${fails} check(s) failed` : 'E2E smoke: all checks passed');
process.exit(fails ? 1 : 0);
