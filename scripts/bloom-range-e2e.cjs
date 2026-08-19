// Bloom drag-to-range E2E — press on a day, drag to another day:
// live rose highlight (bg-rose-400, same style as committed period days)
// spans covered cells while dragging, whole inclusive span logged as period
// flow on release; plain tap still opens DaySheet. No drag = no range.
// Prereq: dev server (bun run dev --port <own port>), then:
//   NODE_PATH=/mnt/c/Repos/period-tracker/node_modules node bloom-range-e2e.cjs
// Port override: BLOOM_BASE_URL=http://localhost:5177/
const { chromium } = require('playwright');

const BASE = process.env.BLOOM_BASE_URL || 'http://localhost:5174/';

const pad = (n) => String(n).padStart(2, '0');
const localISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoAdd = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });
  // hasTouch: true — a phone-like context; touch drags assert the real touch
  // pipeline (touch-action, scroll-swallowing) end-to-end, not synthesized events.
  const context = await browser.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  // Real touch pipeline: headless chromium only performs native touch scrolling
  // (and thus respects touch-action) with touch emulation enabled. Without it,
  // "did not scroll" assertions are vacuous.
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  const fail = (msg) => { console.error('ASSERT FAIL:', msg); process.exitCode = 1; };
  const ok = (msg) => console.log('ok -', msg);

  const today = localISO(new Date());
  // current month's day-10..13 (one grid row, always visible after initial scroll)
  const [y, m1] = today.split('-').map(Number);
  const mm = `${y}-${pad(m1)}`;
  const d10 = `${mm}-10`, d11 = `${mm}-11`, d12 = `${mm}-12`, d13 = `${mm}-13`;
  const d17 = `${mm}-17`, d18 = `${mm}-18`, d19 = `${mm}-19`, d20 = `${mm}-20`;

  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForTimeout(700); // initial scroll rAF

  const box = async (iso) => (await page.$(`button[aria-label="${iso}"]`)).boundingBox();
  const center = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
  const hasClass = async (iso, cls) =>
    page.evaluate(
      ([i, c]) => document.querySelector(`button[aria-label="${i}"]`)?.classList.contains(c),
      [iso, cls],
    );

  // STEP 1 — drag 10 → 13 (forward, same row): live preview as we pass over cells
  const s = center(await box(d10)), m = center(await box(d12)), e = center(await box(d13));
  await page.mouse.move(s.x, s.y);
  await page.mouse.down();
  await page.mouse.move(m.x, m.y, { steps: 12 });
  await page.waitForTimeout(150);
  await page.mouse.move(e.x, e.y, { steps: 12 });
  await page.waitForTimeout(150);
  if (await hasClass(d10, 'bg-rose-400') && await hasClass(d12, 'bg-rose-400'))
    ok('drag highlights start + passed-over cells (rose-400)');
  else fail('live highlight missing on passed-over cells');
  if (await hasClass(d11, 'bg-rose-400')) ok('intermediate day highlighted');
  else fail('intermediate day not highlighted');
  await page.mouse.up();
  await page.waitForTimeout(300);

  // STEP 2 — committed range: all 4 days styled as period, DaySheet NOT opened
  for (const d of [d10, d11, d12, d13]) {
    if (await hasClass(d, 'bg-rose-400')) ok(`${d} committed as period day`);
    else fail(`${d} not styled as period after drag`);
  }
  const sheetOpen = await page.evaluate(() => document.body.innerText.toUpperCase().includes('PERIOD FLOW'));
  if (!sheetOpen) ok('drag did NOT open DaySheet');
  else fail('DaySheet opened after drag commit');

  // STEP 3 — storage: 4 entries, all flow medium
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('bloom.snapshot.v1')).entries);
  const r1 = stored.filter((x) => x.date >= d10 && x.date <= d13);
  if (r1.length === 4 && r1.every((x) => x.flow === 'medium'))
    ok('localStorage: 4 day range logged with medium flow');
  else fail('range not persisted: ' + JSON.stringify(stored));

  // STEP 4 — backward drag 20 → 17: same month, so it REPLACES the previous
  // range — 10..13 must be cleared, only 17..20 remain marked.
  const a = center(await box(d20)), b = center(await box(d17));
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const stored2 = await page.evaluate(() => JSON.parse(localStorage.getItem('bloom.snapshot.v1')).entries);
  const r2 = stored2.filter((x) => x.date >= d17 && x.date <= d20);
  if (r2.length === 4 && stored2.length === 4)
    ok('backward drag (20 → 17) logged 17..20 — old 10..13 range cleared (4 entries total)');
  else fail('backward drag wrong: ' + JSON.stringify(stored2.map((x) => [x.date, x.flow])));
  let staleCleared = true;
  for (const d of [d10, d11, d12, d13]) {
    if (await hasClass(d, 'bg-rose-400')) staleCleared = false;
  }
  if (staleCleared) ok('previously marked days 10..13 no longer styled as period');
  else fail('old range still styled as period after new drag');

  // STEP 5 — plain tap still opens DaySheet and logs nothing new
  const d5 = `${mm}-05`;
  await page.click(`button[aria-label="${d5}"]`);
  await page.waitForTimeout(300);
  const text = await page.evaluate(() => document.body.innerText);
  if (text.toUpperCase().includes('PERIOD FLOW')) ok('plain tap opens DaySheet (tap unchanged)');
  else fail('plain tap did not open DaySheet');
  await page.click('button[aria-label="Close"]');
  await page.waitForTimeout(300);
  const stored3 = await page.evaluate(() => JSON.parse(localStorage.getItem('bloom.snapshot.v1')).entries);
  if (stored3.length === 4) ok('tap did not add entries (4 remain)');
  else fail('tap added entries: ' + stored3.length);

  // STEP 6 — touch drag 22 → 25 (days loggable with the replace semantics)
  const d22 = `${mm}-22`, d23 = `${mm}-23`, d25 = `${mm}-25`;
  const touchStart = (x, y) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(x), y: Math.round(y) }] });
  const touchMove = (x, y) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: Math.round(x), y: Math.round(y) }] });
  const touchEnd = () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const scrollTop = () => page.evaluate(() => ({
    cal: document.querySelector('[data-calendar-scroll]').scrollTop,
    doc: (document.scrollingElement || document.documentElement).scrollTop,
  }));

  // STEP 7 — touch drag 22 → 25 must select a range, NOT scroll the calendar.
  // On a phone this was the reported bug: the browser grabbed the gesture.
  const before = await scrollTop();
  const t0 = center(await box(d22)), t1 = center(await box(d23)), t2 = center(await box(d25));
  await touchStart(t0.x, t0.y);
  await page.waitForTimeout(60);
  await touchMove(t1.x, t1.y);
  await page.waitForTimeout(60);
  if (await hasClass(d23, 'bg-rose-400')) ok('touch drag previews passed-over cells');
  else fail('touch drag preview missing mid-drag');
  const mid = await scrollTop();
  if (mid.cal === before.cal && mid.doc === before.doc)
    ok('touch drag did NOT scroll the calendar (touch-action: none works)');
  else fail(`calendar scrolled during touch drag: ${JSON.stringify(before)} → ${JSON.stringify(mid)}`);
  await touchMove(t2.x, t2.y);
  await page.waitForTimeout(120);
  if (await hasClass(d22, 'bg-rose-400') && await hasClass(d25, 'bg-rose-400'))
    ok('touch drag highlights start + end cells');
  else fail('touch drag end highlight missing');
  await touchEnd();
  await page.waitForTimeout(300);
  const stored4 = await page.evaluate(() => JSON.parse(localStorage.getItem('bloom.snapshot.v1')).entries);
  const r4 = stored4.filter((x) => x.date >= d22 && x.date <= d25);
  if (r4.length === 4 && stored4.length === 4)
    ok('touch drag committed 22..25 as period days — old 17..20 range cleared (4 entries total)');
  else fail('touch drag not committed: ' + stored4.length + ' entries');
  let touchCleared = true;
  for (const d of [d17, d18, d19, d20]) {
    if (await hasClass(d, 'bg-rose-400')) touchCleared = false;
  }
  if (touchCleared) ok('touch drag cleared the previous 17..20 marking');
  else fail('previous range still styled after touch drag');
  const after = await scrollTop();
  if (after.cal === before.cal && after.doc === before.doc)
    ok('calendar still unscrolled after touch release');
  else fail('calendar moved after touch drag');

  // STEP 8 — escape hatch: touch drag starting on a sticky month header
  // (no touch-none there) still scrolls the calendar vertically.
  // Pick a header that is actually on screen at the current scroll position:
  // after step 7 the calendar is scrolled deep, so the current month's header
  // may be out of view — choose the first h2 with a visible bounding box.
  const visibleHeader = await page.evaluate(() => {
    const vh = window.innerHeight;
    for (const h of document.querySelectorAll('[data-month] h2')) {
      const r = h.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= vh) return { x: r.left, y: r.top, w: r.width, h: r.height };
    }
    return null;
  });
  if (!visibleHeader) throw new Error('no visible month header to swipe on');
  const hx = visibleHeader.x + visibleHeader.w / 2;
  const hy = visibleHeader.y + visibleHeader.h / 2;
  await touchStart(hx, hy);
  for (let i = 1; i <= 4; i++) {
    await touchMove(hx, hy - i * 40);
    await page.waitForTimeout(40);
  }
  await touchEnd();
  await page.waitForTimeout(200);
  const scrolled = await scrollTop();
  // Headless chromium can route the gesture to the document scroller instead of
  // the calendar container; either moving proves the touch-action: none on the
  // cells did not kill scrolling for the whole calendar.
  if (scrolled.cal !== before.cal || scrolled.doc !== before.doc)
    ok(`swipe on month header still scrolls (${JSON.stringify(before)} → ${JSON.stringify(scrolled)})`);
  else fail('calendar vertical scroll broken — touch-none too aggressive');

  // STEP 9 — Today pill + scroll still fine, screenshot for visual review
  await page.click('button[aria-label="Scroll to today"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/bloom-range-drag.png' });
  console.log('JS ERRORS:', errors.length ? errors.join(' | ') : 'none');
  if (errors.length) fail('page errors present');
  await browser.close();
  if (process.exitCode) { console.error('E2E FAILED'); process.exit(1); }
  console.log('E2E PASS');
})().catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1); });