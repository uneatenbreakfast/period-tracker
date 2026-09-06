// Bloom swipe-to-switch-tabs E2E — real touch gestures via CDP.
// Left swipe = next tab, right swipe = previous tab; gestures that START
// inside the calendar component never navigate. Content follows the finger
// mid-swipe; indicator pill glides to the active tab.
// Prereq: dev server (npx vite --host 0.0.0.0 --port 5196), then:
//   NODE_PATH=$(pwd)/node_modules node scripts/bloom-swipe-tabs-e2e.cjs
// Port override: BLOOM_BASE_URL=http://localhost:5196/
const { chromium } = require('playwright');

const BASE = process.env.BLOOM_BASE_URL || 'http://localhost:5194/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// CDP touch swipe — page.touchscreen only supports tap().
async function swipe(cdp, x0, y0, dx, dy, { steps = 12, hold = 0 } = {}) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: x0, y: y0 }],
  });
  if (hold) await sleep(hold);
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x0 + (dx * i) / steps, y: y0 + (dy * i) / steps }],
    });
    await sleep(16); // ≈ 60fps
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });
  const context = await browser.newContext({
    viewport: { width: 430, height: 932 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  const fail = (msg) => { console.error('ASSERT FAIL:', msg); process.exitCode = 1; };
  const ok = (msg) => console.log('ok -', msg);
  const cdp = await context.newCDPSession(page);

  const activeTab = () =>
    page.evaluate(() => {
      const active = document.querySelector('nav[aria-label="Views"] button[data-active="true"]');
      return active ? active.textContent.trim().toLowerCase() : null;
    });

  // Sliding underline — where the .tab-indicator pill currently sits (x px).
  const indicatorX = () =>
    page.evaluate(() => {
      const pill = document.querySelector('.tab-indicator');
      if (!pill || pill.classList.contains('hidden')) return null;
      return pill.getBoundingClientRect().x;
    });
  const tabButtonX = (label) =>
    page.evaluate(
      (l) => {
        const b = document.querySelector(`nav[aria-label="Views"] button[data-tab="${l}"]`);
        return b ? b.getBoundingClientRect().x : null;
      },
      label,
    );

  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForTimeout(700); // initial scroll rAF

  // Layout sanities — main geometry changes per tab, so compute the content
  // swipe Y fresh before every gesture (a value from the tall calendar tab
  // lands BELOW the short health main).
  const contentY = () =>
    page.evaluate(() => {
      const main = document.querySelector('main');
      const r = main.getBoundingClientRect();
      return Math.min(r.top + 260, r.bottom - 60);
    });
  const cellY = await page.evaluate(() => {
    const cell = document.querySelector('[data-calendar-scroll] button');
    const cr = cell ? cell.getBoundingClientRect() : null;
    return cr ? cr.top + cr.height / 2 : null;
  });

  // STEP 1 — initial tab
  if ((await activeTab()) === 'calendar') ok('initial tab = calendar');
  else fail('expected calendar, got ' + (await activeTab()));

  // STEP 1b — sliding indicator under the calendar tab at first paint
  const calX = await tabButtonX('calendar');
  if (calX !== null && Math.abs((await indicatorX()) - calX) < 2) {
    ok('indicator sits under calendar tab');
  } else {
    fail('indicator at ' + (await indicatorX()) + ', calendar button at ' + calX);
  }

  // STEP 2 — calendar exclusion: fast left/right on calendar content
  let y = await contentY();
  await swipe(cdp, 350, y, -250, 0, { steps: 6 });
  await page.waitForTimeout(100);
  if ((await activeTab()) === 'calendar') ok('fast left swipe on calendar content stays on calendar');
  else fail('left swipe on calendar navigated to ' + (await activeTab()));

  await swipe(cdp, 80, y, 250, 0, { steps: 6 });
  await page.waitForTimeout(100);
  if ((await activeTab()) === 'calendar') ok('fast right swipe on calendar content stays on calendar');
  else fail('right swipe on calendar navigated to ' + (await activeTab()));

  // STEP 3 — calendar exclusion: long-press range drag on a day cell
  if (cellY) {
    await swipe(cdp, 215, cellY, 120, 0, { steps: 12, hold: 500 });
    await page.waitForTimeout(100);
    if ((await activeTab()) === 'calendar') ok('long-press horizontal drag on day cell stays on calendar');
    else fail('calendar range drag navigated to ' + (await activeTab()));
  }

  // STEP 4 — swipe switches tabs on non-calendar content
  await page.click('nav[aria-label="Views"] button:text("Health")');
  await page.waitForTimeout(100);
  if ((await activeTab()) === 'health') ok('nav click → health');
  else fail('expected health, got ' + (await activeTab()));
  const healthX = await tabButtonX('health');
  if (healthX !== null && (await indicatorX()) > calX + 5) {
    ok('indicator glided right onto health tab');
  } else {
    fail('indicator did not move to health (x=' + (await indicatorX()) + ', health button at ' + healthX + ')');
  }

  y = await contentY();
  await swipe(cdp, 350, y, -250, 0, { steps: 6 });
  await page.waitForTimeout(100);
  if ((await activeTab()) === 'trends') ok('left swipe on health → trends');
  else fail('left swipe on health gave ' + (await activeTab()));

  y = await contentY();
  await swipe(cdp, 350, y, -250, 0, { steps: 6 });
  await page.waitForTimeout(100);
  if ((await activeTab()) === 'settings') ok('left swipe on trends → settings');
  else fail('left swipe on trends gave ' + (await activeTab()));

  y = await contentY();
  await swipe(cdp, 80, y, 250, 0, { steps: 6 });
  await page.waitForTimeout(100);
  if ((await activeTab()) === 'trends') ok('right swipe on settings → trends');
  else fail('right swipe on settings gave ' + (await activeTab()));

  // STEP 5 — wrap-around: settings → calendar
  await page.click('nav[aria-label="Views"] button:text("Settings")');
  await page.waitForTimeout(100);
  y = await contentY();
  await swipe(cdp, 350, y, -250, 0, { steps: 6 });
  await page.waitForTimeout(100);
  if ((await activeTab()) === 'calendar') ok('left swipe on settings wraps → calendar');
  else fail('wrap swipe gave ' + (await activeTab()));

  // STEP 6 — short swipe / vertical drag never navigate
  await page.click('nav[aria-label="Views"] button:text("Health")');
  await page.waitForTimeout(100);
  y = await contentY();
  await swipe(cdp, 350, y, -30, 0, { steps: 6 }); // below threshold
  await page.waitForTimeout(100);
  if ((await activeTab()) === 'health') ok('short swipe (< threshold) stays');
  else fail('short swipe navigated to ' + (await activeTab()));

  await swipe(cdp, 350, y, 30, -260, { steps: 12 }); // vertical scroll
  await page.waitForTimeout(100);
  if ((await activeTab()) === 'health') ok('vertical swipe (scroll) stays');
  else fail('vertical swipe navigated to ' + (await activeTab()));

  if (errors.length) {
    errors.forEach((e) => console.error('ERROR EVENT:', e));
    fail('page errors detected');
  } else {
    ok('no page/console errors');
  }

  await browser.close();
  console.log(process.exitCode ? 'FAILED' : 'ALL PASSED');
  process.exit(process.exitCode || 0);
})();