/**
 * Capture marketing/QA screenshots at a 390x844 mobile viewport.
 * Requires `npm run build && npm run preview` running on :4173 (base /peel-streets/).
 * Uses playwright-core with a system Chrome/Chromium (set CHROME_PATH to override).
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:4173/peel-streets/';
const OUT = new URL('../docs/screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const exe = process.env.CHROME_PATH || '/usr/bin/google-chrome';

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: false, isMobile: false });
const page = await ctx.newPage();
const wait = (ms) => page.waitForTimeout(ms);
page.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
page.on('console', (m) => m.type() === 'error' && console.error('CONSOLE', m.text()));

async function cellCenter(r, c) {
  return page.evaluate(([r, c]) => {
    const v = window.peelDebug && window.__view;
    const cv = document.getElementById('board').getBoundingClientRect();
    const [x, y] = window.__view.center({ r, c });
    return [cv.left + x, cv.top + y];
  }, [r, c]);
}

// 1) Tutorial level with the finger hint
await page.goto(BASE + '?level=1');
await wait(900);
await page.screenshot({ path: OUT + '01-tutorial.png' });

// 2) Mid-game level, mid-peel (mouse held down and dragged part-way)
await page.goto(BASE + '?level=11&unlock=1');
await wait(600);
let [x, y] = await cellCenter(2, 2);
await page.mouse.move(x + 20, y + 20);
await page.mouse.down();
await page.mouse.move(x + 8, y + 8, { steps: 4 });
await page.mouse.move(x - 2, y - 2, { steps: 4 });
await wait(250);
await page.screenshot({ path: OUT + '02-mid-peel.png' });
await page.mouse.move(x - 30, y - 30, { steps: 6 });
await wait(200);
await page.screenshot({ path: OUT + '03-lifted.png' });
await page.mouse.up();

// 4) Solved state (play through the verified solution via the QA hook)
await page.goto(BASE + '?level=20&unlock=1');
await wait(500);
await page.evaluate(() => window.peelDebug.solve(120));
await wait(1350);
await page.screenshot({ path: OUT + '04-solved.png' });
await wait(1400);
await page.screenshot({ path: OUT + '05-win-popup.png' });

// 5) District map with some progress restored
await page.evaluate(() => {
  const stars = {};
  for (let i = 1; i <= 13; i++) stars[i] = i % 4 === 0 ? 2 : 3;
  localStorage.setItem('peelstreets.progress.v1', JSON.stringify({ stars, sound: true, seenTips: [] }));
});
await page.goto(BASE);
await wait(900);
await page.screenshot({ path: OUT + '06-district-map.png' });

// 6) Fail offer (jam) popup
await page.goto(BASE + '?level=4&unlock=1');
await wait(400);
await page.evaluate(() => {
  const s = window.__app.session;
  s.budget = 1;
  window.__app.syncHudPublic();
});
[x, y] = await cellCenter(3, 0);
await page.mouse.click(x, y);
await wait(400);
const [tx, ty] = await cellCenter(1, 2);
await page.mouse.click(tx, ty);
await wait(1100);
await page.screenshot({ path: OUT + '07-fail-offer.png' });

// 8) Late-game board: bridges, pins, stiff stickers, hidden stacks
await page.goto(BASE + '?level=24&unlock=1');
await wait(600);
await page.screenshot({ path: OUT + '08-late-game.png' });

await browser.close();
console.log('screenshots written to', OUT);
