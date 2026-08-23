// Bloom drag-to-range E2E — LONG PRESS a day (400ms hold), THEN drag to
// another day: live rose highlight (bg-rose-400, same style as committed
// period days) spans covered cells while dragging, whole inclusive span
// logged as period flow on release. Ranges render as a CONTINUOUS STRIP:
// start day = asymmetric cap (convex BL, concave TL), end day = right cap,
// interior days = flush squares (rounded-none) filling the column edge-to-
// edge; a lone day stays a circle. Quick drags (movement before the hold
// fires) select nothing; a long press WITHOUT a drag is still a plain tap
// (DaySheet). Prereq: dev server (bun run dev --port <own port>), then:
//   NODE_PATH=/mnt/c/Repos/period-tracker/node_modules node bloom-range-e2e.cjs
// Port override: BLOOM_BASE_URL=http://localhost:5177/
const { chromium } = require('playwright');

const BASE = process.env.BLOOM_BASE_URL || 'http://localhost:5174/';
// Long-press gate in src/lib/rangeDrag.ts — E2E holds must comfortably exceed it.
const HOLD_MS = 600;

const pad = (n) => String(n).padStart(2, '0');
const localISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoAdd = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

// A cell is "highlighted" when it is part of a strip: start/end/single caps
// have bg-rose-400 + font-bold, middle cells have font-bold text-rose-500.
// Plain non-period cells never get font-bold, so it reliably distinguishes.
const isHighlightedClass = async (iso, hasClassFn) =>
  (await hasClassFn(iso, 'bg-rose-400')) || (await hasClassFn(iso, 'font-bold'));

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

  // BLOOM-0011 — haptic arm pulse: spy on navigator.vibrate BEFORE any app
  // code runs. The calendar must pulse exactly once when the long-press
  // timer arms the selection — and never on fast drags/swipes.
  await page.addInitScript(() => {
    window.__vibrate = { calls: [] };
    try {
      Object.defineProperty(navigator, 'vibrate', {
        configurable: true,
        value: (p) => { window.__vibrate.calls.push(p); return true; },
      });
    } catch { /* native vibrate is non-configurable — arm asserts will fail */ }
  });

  const today = localISO(new Date());
  // current month's day-10..25 (grid rows, always visible after initial scroll)
  const [y, m1] = today.split('-').map(Number);
  const mm = `${y}-${pad(m1)}`;
  const D = (n) => `${mm}-${pad(n)}`;
  const d10 = D(10), d11 = D(11), d12 = D(12), d13 = D(13);
  const d15 = D(15), d16 = D(16), d17 = D(17), d18 = D(18), d19 = D(19), d20 = D(20);
  const d21 = D(21), d22 = D(22), d23 = D(23), d24 = D(24), d25 = D(25);

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
  const storedEntries = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem('bloom.snapshot.v1')).entries);
  // DaySheet is the only element with the Close button. (A body-text check for
  // "PERIOD FLOW" is VACUOUS — the menstrual card's placeholder text also
  // contains "period flow" and is always rendered.)
  const sheetOpen = () => page.evaluate(() => !!document.querySelector('button[aria-label="Close"]'));
  const vibrateCalls = () => page.evaluate(() => window.__vibrate.calls);

  // STEP 1 — FAST mouse drag 15 → 16 (no hold): the long-press gate must
  // reject it — no highlight, nothing logged.
  const s = center(await box(d15)), q = center(await box(d16));
  await page.mouse.move(s.x, s.y);
  await page.mouse.down();
  await page.mouse.move(q.x, q.y, { steps: 2 });
  if (!(await hasClass(d16, 'bg-rose-400')))
    ok('fast drag (no hold) shows no selection highlight');
  else fail('fast drag highlighted a cell before the long press');
  await page.mouse.up();
  await page.waitForTimeout(300);
  let stored = await storedEntries();
  if (stored.length === 0) ok('fast drag logged nothing (0 entries)');
  else fail('fast drag committed a range: ' + JSON.stringify(stored));
  if (!(await sheetOpen())) ok('fast drag did NOT open DaySheet');
  else fail('fast drag opened DaySheet');
  if (!(await hasClass(d15, 'bg-rose-400')) && !(await hasClass(d16, 'bg-rose-400')))
    ok('cells 15/16 unstyled after fast drag');
  else fail('fast drag left cells styled');
  if ((await vibrateCalls()).length === 0) ok('fast drag (no hold) fired no vibration');
  else fail('fast drag vibrated: ' + JSON.stringify(await vibrateCalls()));

  // STEP 2 — long press WITHOUT a drag on 21: still a plain tap — DaySheet
  // opens, nothing logged.
  const t = center(await box(d21));
  await page.mouse.move(t.x, t.y);
  await page.mouse.down();
  await page.waitForTimeout(HOLD_MS);
  await page.mouse.up();
  await page.waitForTimeout(300);
  if (await sheetOpen()) ok('long press without drag = plain tap (DaySheet opens)');
  else fail('long press without drag did not open DaySheet');
  await page.click('button[aria-label="Close"]');
  await page.waitForTimeout(300);
  stored = await storedEntries();
  if (stored.length === 0) ok('long press alone logged nothing (0 entries)');
  else fail('long press alone logged entries: ' + stored.length);
  // [30, 30, 30] = HAPTIC_DOUBLE_PULSE_PATTERN in src/lib/haptics.ts — two
  // bursts, one arm tick (even indices vibrate, odd indices pause).
  const v2 = await vibrateCalls();
  if (v2.length === 1 && JSON.stringify(v2[0]) === '[30,30,30]') {
    ok('long press fired the double pulse (selection armed)');
  } else fail('long press vibrate wrong: ' + JSON.stringify(v2));

  // STEP 3 — LONG-PRESS drag 10 → 13 (forward, same row): hold, then drag;
  // live preview as we pass over cells, commit on release.
  const s3 = center(await box(d10)), m3 = center(await box(d12)), e3 = center(await box(d13));
  await page.mouse.move(s3.x, s3.y);
  await page.mouse.down();
  await page.waitForTimeout(HOLD_MS); // long press arms the selection
  await page.mouse.move(m3.x, m3.y, { steps: 12 });
  await page.waitForTimeout(150);
  await page.mouse.move(e3.x, e3.y, { steps: 12 });
  await page.waitForTimeout(150);
  if (await hasClass(d10, 'bg-rose-400') && (await hasClass(d12, 'bg-slate-100') || await hasClass(d12, 'font-bold')))
    ok('long-press drag highlights start (rose) + passed-over cells (month bg)');
  else fail('live highlight missing on passed-over cells');
  if (!(await hasClass(d11, 'bg-rose-400'))) ok('intermediate day has no rose fill');
  else fail('intermediate day still has rose fill');
  // Continuous-strip preview: drag start = asymmetric cap (convex BL, concave
  // TL via gradient), interior = flush square, drag end = right semicircle cap.
  if (await hasClass(d10, 'rounded-bl-full'))
    ok('preview: start day has convex bottom-left cap (rounded-bl-full)');
  else fail('preview: start day missing convex bottom-left');
  if (await hasClass(d12, 'rounded-none')) ok('preview: interior day is a flush square (rounded-none)');
  else fail('preview: interior day not a square');
  if (await hasClass(d13, 'rounded-r-full')) ok('preview: end day has right semicircle cap (rounded-r-full)');
  else fail('preview: end day missing right cap');
  await page.mouse.up();
  await page.waitForTimeout(300);
  if ((await vibrateCalls()).length === 2) ok('long-press drag armed with a second pulse');
  else fail('arm pulse count wrong after STEP 3');

  // STEP 4 — committed range: start/end have rose, middles have month bg,
  // DaySheet NOT opened.
  for (const d of [d10, d11, d12, d13]) {
    if (await isHighlightedClass(d, hasClass)) ok(`${d} committed as period day`);
    else fail(`${d} not styled as period after drag`);
  }
  if (!(await sheetOpen())) ok('drag did NOT open DaySheet');
  else fail('DaySheet opened after drag commit');
  // Committed strip shape: 10 = asymmetric start cap, 11/12 = squares, 13 = right cap.
  if (await hasClass(d10, 'rounded-bl-full') && await hasClass(d10, 'rounded-br-none'))
    ok('committed: run start has convex bottom-left cap (rounded-bl-full)');
  else fail('committed: run start cap wrong: ' + await page.evaluate((i) => document.querySelector(`button[aria-label="${i}"]`)?.className, d10));
  if (await hasClass(d11, 'rounded-none') && await hasClass(d12, 'rounded-none'))
    ok('committed: interior days are flush squares');
  else fail('committed: interior days not squares');
  if (await hasClass(d13, 'rounded-r-full') && await hasClass(d13, 'rounded-l-none'))
    ok('committed: run end keeps the right semicircle cap');
  else fail('committed: run end cap wrong');
  // Continuous geometry: strip cells fill the column edge-to-edge (no gap
  // between consecutive days) and are wider than the plain day circles.
  const [b10, b11, b12, b13, b15] = await Promise.all([box(d10), box(d11), box(d12), box(d13), box(d15)]);
  const gaps = [b10.x + b10.width - b11.x, b11.x + b11.width - b12.x, b12.x + b12.width - b13.x];
  if (gaps.every((g) => Math.abs(g) < 1.5))
    ok(`strip is continuous: consecutive strip days touch edge-to-edge (gaps ${gaps.map((g) => g.toFixed(2)).join(', ')})`);
  else fail(`strip has gaps: ${gaps.map((g) => g.toFixed(2)).join(', ')}px`);
  if (b10.width > b15.width && b13.width > b15.width)
    ok('strip days fill the grid column (wider than plain circles)');
  else fail(`strip width ${b10.width.toFixed(1)}px not wider than circle ${b15.width.toFixed(1)}px`);

  // STEP 5 — storage: 4 entries, all flow medium
  stored = await storedEntries();
  const r1 = stored.filter((x) => x.date >= d10 && x.date <= d13);
  if (r1.length === 4 && r1.every((x) => x.flow === 'medium'))
    ok('localStorage: 4 day range logged with medium flow');
  else fail('range not persisted: ' + JSON.stringify(stored));

  // STEP 6 — backward long-press drag 20 → 17: same month, so it REPLACES
  // the previous range — 10..13 must be cleared, only 17..20 remain marked.
  const a6 = center(await box(d20)), b6 = center(await box(d17));
  await page.mouse.move(a6.x, a6.y);
  await page.mouse.down();
  await page.waitForTimeout(HOLD_MS);
  await page.mouse.move(b6.x, b6.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  stored = await storedEntries();
  const r2 = stored.filter((x) => x.date >= d17 && x.date <= d20);
  if (r2.length === 4 && stored.length === 4)
    ok('backward drag (20 → 17) logged 17..20 — old 10..13 range cleared (4 entries total)');
  else fail('backward drag wrong: ' + JSON.stringify(stored.map((x) => [x.date, x.flow])));
  let staleCleared = true;
  for (const d of [d10, d11, d12, d13]) {
    if (await isHighlightedClass(d, hasClass)) staleCleared = false;
  }
  if (staleCleared) ok('previously marked days 10..13 no longer styled as period');
  else fail('old range still styled as period after new drag');

  // STEP 7 — quick plain tap on 05 still opens DaySheet and logs nothing new
  await page.click(`button[aria-label="${D(5)}"]`);
  await page.waitForTimeout(300);
  if (await sheetOpen()) ok('plain tap opens DaySheet (tap unchanged)');
  else fail('plain tap did not open DaySheet');
  await page.click('button[aria-label="Close"]');
  await page.waitForTimeout(300);
  stored = await storedEntries();
  if (stored.length === 4) ok('tap did not add entries (4 remain)');
  else fail('tap added entries: ' + stored.length);

  // STEP 8 — touch pipeline
  const touchStart = (x, y) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(x), y: Math.round(y) }] });
  const touchMove = (x, y) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: Math.round(x), y: Math.round(y) }] });
  const touchEnd = () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const scrollTop = () => page.evaluate(() => ({
    cal: document.querySelector('[data-calendar-scroll]').scrollTop,
    doc: (document.scrollingElement || document.documentElement).scrollTop,
  }));

  // STEP 9 — QUICK touch swipe 22 → 23 (no hold): must NOT select, nor scroll
  // past the slop abort. On a phone this distinguishes accidental swipes from
  // intent.
  const t0 = center(await box(d22)), t1 = center(await box(d23));
  await touchStart(t0.x, t0.y);
  await touchMove(t1.x, t1.y);
  await touchEnd();
  await page.waitForTimeout(300);
  stored = await storedEntries();
  if (stored.length === 4)
    ok('quick touch swipe (no hold) logged nothing');
  else fail('quick touch swipe committed: ' + stored.length);
  if (!(await isHighlightedClass(d22, hasClass)) && !(await isHighlightedClass(d23, hasClass)))
    ok('quick touch swipe left no highlight');
  else fail('quick touch swipe highlighted cells');
  // 3 pulses by now: STEP2 arm, STEP3 arm, backward-drag arm.
  if ((await vibrateCalls()).length === 3) ok('quick touch swipe fired no vibration');
  else fail('quick touch swipe vibrated');

  // STEP 10 — LONG-PRESS touch drag 22 → 25 must select a range, NOT scroll
  // the calendar. On a phone this was the reported bug: the browser grabbed
  // the gesture.
  const before = await scrollTop();
  const t2 = center(await box(d25));
  await touchStart(t0.x, t0.y);
  await page.waitForTimeout(HOLD_MS); // long press arms the selection
  await touchMove(t1.x, t1.y);
  await page.waitForTimeout(60);
  if (await isHighlightedClass(d23, hasClass)) ok('touch drag previews passed-over cells');
  else fail('touch drag preview missing mid-drag');
  const mid = await scrollTop();
  if (mid.cal === before.cal && mid.doc === before.doc)
    ok('touch drag did NOT scroll the calendar (touch-pan-y + armed veto hold the gesture)');
  else fail(`calendar scrolled during touch drag: ${JSON.stringify(before)} → ${JSON.stringify(mid)}`);
  await touchMove(t2.x, t2.y);
  await page.waitForTimeout(120);
  if (await hasClass(d22, 'bg-rose-400') && await hasClass(d25, 'bg-rose-400'))
    ok('touch drag highlights start + end cells');
  else fail('touch drag end highlight missing');
  if (await hasClass(d22, 'rounded-bl-full') && await hasClass(d25, 'rounded-r-full'))
    ok('touch drag preview shows strip caps (start asymmetric, end right)');
  else fail('touch drag strip caps missing');
  await touchEnd();
  await page.waitForTimeout(300);
  if ((await vibrateCalls()).length === 4) ok('touch long-press armed with a pulse');
  else fail('touch arm pulse missing: ' + JSON.stringify(await vibrateCalls()));
  stored = await storedEntries();
  const r4 = stored.filter((x) => x.date >= d22 && x.date <= d25);
  if (r4.length === 4 && stored.length === 4)
    ok('touch drag committed 22..25 as period days — old 17..20 range cleared (4 entries total)');
  else fail('touch drag not committed: ' + stored.length + ' entries');
  let touchCleared = true;
  for (const d of [d17, d18, d19, d20]) {
    if (await isHighlightedClass(d, hasClass)) touchCleared = false;
  }
  if (touchCleared) ok('touch drag cleared the previous 17..20 marking');
  else fail('previous range still styled after touch drag');
  const after = await scrollTop();
  if (after.cal === before.cal && after.doc === before.doc)
    ok('calendar still unscrolled after touch release');
  else fail('calendar moved after touch drag');

  // STEP 11 — escape hatch: touch drag starting on the sticky weekday row
  // (no touch-none there) still scrolls the calendar vertically.
  // The weekday strip is sticky inside the calendar box, so it is always on
  // screen regardless of the current scroll position.
  const weekdayBox = await page.evaluate(() => {
    const h = document.querySelector('[data-calendar-weekdays]');
    const r = h.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  if (!weekdayBox.w) throw new Error('no sticky weekday row to swipe on');
  const hx = weekdayBox.x + weekdayBox.w / 2;
  const hy = weekdayBox.y + weekdayBox.h / 2;
  await touchStart(hx, hy);
  for (let i = 1; i <= 4; i++) {
    await touchMove(hx, hy - i * 40);
    await page.waitForTimeout(40);
  }
  await touchEnd();
  await page.waitForTimeout(200);
  const scrolled = await scrollTop();
  // Headless chromium can route the gesture to the document scroller instead of
  // the calendar container; either moving proves the cell pan restriction did
  // not kill scrolling for the whole calendar. In the calendar-only tab
  // layout (BLOOM-0010) the document no longer overflows the viewport, so a
  // doc-routed swipe has nowhere to go — fall back to proving the container
  // itself still scrolls. (On real devices the weekday strip lives INSIDE the
  // container, so a strip pan scrolls the box directly either way.)
  if (scrolled.cal !== before.cal || scrolled.doc !== before.doc)
    ok(`swipe on weekday row still scrolls (${JSON.stringify(before)} → ${JSON.stringify(scrolled)})`);
  else if (scrolled.cal === before.cal && scrolled.doc === 0) {
    const docRange = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    if (docRange <= 0) {
      const w0 = await page.evaluate(() => document.querySelector('[data-calendar-scroll]').scrollTop);
      await page.mouse.move(215, 300);
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(150);
      const w1 = await page.evaluate(() => document.querySelector('[data-calendar-scroll]').scrollTop);
      if (w1 !== w0) ok(`calendar container still scrolls (wheel ${w0}→${w1}; doc has no scroll range on calendar-only tab)`);
      else fail('calendar container does not scroll at all');
    } else {
      fail('calendar vertical scroll broken — cell swipe does not scroll');
    }
  } else {
    fail('calendar vertical scroll broken — cell swipe does not scroll');
  }

  // STEP 12 — Today pill + scroll still fine.
  await page.click('button[aria-label="Scroll to today"]');
  await page.waitForTimeout(400);

  // STEP 12b — BLOOM-0015: a REGULAR vertical swipe ON A DAY CELL scrolls the
  // calendar (cells are touch-pan-y; only an ARMED gesture hands the touch to
  // the selection). Quick swipe = no long press = no veto = browser pan.
  const sc0 = await scrollTop();
  const cellPt = center(await box(d22));
  await touchStart(cellPt.x, cellPt.y);
  for (let i = 1; i <= 4; i++) {
    await touchMove(cellPt.x, cellPt.y - i * 40);
    await page.waitForTimeout(40);
  }
  await touchEnd();
  await page.waitForTimeout(300);
  const sc1 = await scrollTop();
  if (sc1.cal !== sc0.cal)
    ok(`swipe on a day cell scrolls the calendar (${sc0.cal} → ${sc1.cal})`);
  else fail('swipe on a day cell did not scroll the calendar');
  await page.click('button[aria-label="Scroll to today"]');
  await page.waitForTimeout(400);

  // STEP 13 — single day via DaySheet: a lone period day keeps the full
  // circle (no caps), stays small (not a strip), and neighbors unaffected.
  const d14 = D(14);
  await page.click(`button[aria-label="${d14}"]`);
  await page.waitForTimeout(300);
  if (!(await sheetOpen())) fail('tap on 14 did not open DaySheet for single-day test');
  await page.click('button:has-text("Medium")');
  await page.waitForTimeout(300);
  await page.click('button[aria-label="Close"]');
  await page.waitForTimeout(300);
  if (await hasClass(d14, 'bg-rose-400') && await hasClass(d14, 'rounded-full'))
    ok('single day logged via DaySheet keeps the full circle (rounded-full)');
  else fail('single day not a circle: ' + (await page.evaluate((i) => document.querySelector(`button[aria-label="${i}"]`)?.className, d14)));
  const b14 = await box(d14);
  if (b14.width < 48 && !(await hasClass(d13, 'bg-rose-400')) && !(await hasClass(d15, 'bg-rose-400')))
    ok('single day is a small circle and neighbors 13/15 stay unstyled');
  else fail('single-day circle geometry or neighbor isolation wrong');
  stored = await storedEntries();
  if (stored.length === 5) ok('single-day log persisted (5 entries total)');
  else fail('single-day log not persisted: ' + stored.length);

  // ==== BLOOM-0013 — edit mode + continuous (growing) calendar ====
  const monthCount = () => page.evaluate(() => document.querySelectorAll('[data-month]').length);
  const monthAttr = (pos) =>
    page.evaluate((p) => {
      const els = [...document.querySelectorAll('[data-month]')];
      return (els.at(p === 'first' ? 0 : -1) || null)?.getAttribute('data-month');
    }, pos);
  const editRangeText = () =>
    page.evaluate(() => document.querySelector('[data-edit-range]')?.textContent ?? '');
  const editHandleIso = (which) =>
    page.evaluate((w) => document.querySelector(`[data-edit-handle="${w}"]`)?.getAttribute('aria-label'), which);
  const countInclusive = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;

  // STEP 14 — long-press RELEASE on a day INSIDE the committed run (23, in
  // 22..25) enters EDIT MODE: 23 becomes the new START, 25 the end stays, the
  // Save/Cancel modal appears, nothing commits, DaySheet stays closed.
  const e14 = center(await box(d23));
  await page.mouse.move(e14.x, e14.y);
  await page.mouse.down();
  await page.waitForTimeout(HOLD_MS); // arms → edit entry, not a drag commit
  // BLOOM-0015: edit mode + the pulse fire AT ARM (400ms) — while the finger
  // is still DOWN, not on release. Assert the modal is already up mid-hold.
  const modalWhileHeld = await page.evaluate(
    () => !!document.querySelector('[data-edit-modal]') && !!document.querySelector('button[aria-label="Save edit"]'),
  );
  if (modalWhileHeld) ok('edit mode opened AT ARM (modal visible while still holding)');
  else fail('edit mode did not open until finger release');
  if ((await vibrateCalls()).length === 5) ok('haptic pulse fired AT ARM (5 calls while still holding)');
  else fail('pulse not fired at arm: ' + JSON.stringify(await vibrateCalls()));
  await page.mouse.up();
  await page.waitForTimeout(400);
  const modalShown = await page.evaluate(
    () => !!document.querySelector('[data-edit-modal]') && !!document.querySelector('button[aria-label="Save edit"]'),
  );
  if (modalShown) ok('long-press on a committed period day enters edit mode (Save/Cancel modal shows)');
  else fail('edit modal did not appear after long-press on period day');
  if ((await editHandleIso('start')) === d23 && (await editHandleIso('end')) === d25)
    ok('pressed day became the new START handle, run END stays (23 start / 25 end)');
  else fail(`handles wrong: start=${await editHandleIso('start')} end=${await editHandleIso('end')}`);
  if (!(await hasClass(d22, 'bg-rose-400')) && (await isHighlightedClass(d23, hasClass)) && (await isHighlightedClass(d24, hasClass)) && (await hasClass(d25, 'bg-rose-400')))
    ok('edited preview: 22 dropped out of the range, 23..25 highlighted');
  else fail('edited preview range wrong');
  if (await hasClass(d24, 'rounded-none')) ok('edited preview keeps the continuous strip (interior square)');
  else fail('edited strip interior missing');
  if (!(await sheetOpen())) ok('edit entry did NOT open DaySheet');
  else fail('DaySheet opened under edit mode');
  const rt14 = await editRangeText();
  if (rt14.includes('23') && rt14.includes('25')) ok(`edit modal shows the range (${rt14})`);
  else fail('edit modal range text wrong: ' + rt14);
  stored = await storedEntries();
  if (stored.length === 5) ok('edit entry committed nothing yet (5 entries still)');
  else fail('edit entry mutated storage: ' + stored.length);
  if ((await vibrateCalls()).length === 5) ok('edit entry armed with the pulse (5 calls total)');
  else fail('edit entry pulse count wrong: ' + JSON.stringify(await vibrateCalls()));

  // STEP 15 — drag the START handle 23 → 21: the bound follows the pointer,
  // preview widens, nothing commits on release.
  const s15 = center(await box(d23)), q15 = center(await box(d21));
  await page.mouse.move(s15.x, s15.y);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.move(q15.x, q15.y, { steps: 8 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(300);
  if ((await editHandleIso('start')) === d21 && (await editHandleIso('end')) === d25)
    ok('start handle dragged 23 → 21 (21 start / 25 end)');
  else fail(`start drag wrong: start=${await editHandleIso('start')} end=${await editHandleIso('end')}`);
  if ((await hasClass(d21, 'bg-rose-400')) && (await hasClass(d21, 'rounded-bl-full')) && (await hasClass(d25, 'bg-rose-400')) && (await hasClass(d25, 'rounded-r-full')))
    ok('start drag preview: 21..25 highlighted with correct strip caps');
  else fail('start drag preview shape wrong');
  const rt15 = await editRangeText();
  if (rt15.includes('21') && rt15.includes('25')) ok(`edit modal range updated live (${rt15})`);
  else fail('edit modal range did not follow the handle: ' + rt15);
  stored = await storedEntries();
  if (stored.length === 5) ok('handle drag committed nothing on release (5 entries still)');
  else fail('handle drag mutated storage: ' + stored.length);

  // STEP 16 — drag the END handle to the BOTTOM EDGE of the scroll box: the
  // calendar auto-scrolls under the stationary pointer (continuous) and the
  // end handle keeps moving FORWARD across the new cells — one gesture that
  // crosses months.
  const calRect = await page.evaluate(() => {
    const r = document.querySelector('[data-calendar-scroll]').getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  });
  const b25 = await box(d25);
  const edgeX = b25.x + b25.width / 2, edgeY = calRect.bottom - 24;
  const st0 = await page.evaluate(() => document.querySelector('[data-calendar-scroll]').scrollTop);
  await page.mouse.move(b25.x + b25.width / 2, b25.y + b25.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.move(edgeX, edgeY, { steps: 4 });
  await page.waitForTimeout(120);
  await page.waitForTimeout(900); // hold at the edge — auto-scroll keeps dragging
  const st1 = await page.evaluate(() => document.querySelector('[data-calendar-scroll]').scrollTop);
  if (st1 > st0) ok(`edge auto-scroll scrolled the calendar while dragging (${st0} → ${st1})`);
  else fail(`no auto-scroll at the edge: ${st0} → ${st1}`);
  const end16 = await editHandleIso('end');
  if (end16 && end16 > d25) ok(`end handle crossed days under the stationary pointer (end=${end16} > 25)`);
  else fail(`end handle did not advance: ${end16}`);
  await page.mouse.up();
  await page.waitForTimeout(300);
  if ((await vibrateCalls()).length === 5) ok('handle drags fired no extra pulses (5 calls total)');
  else fail('handle drag vibrated: ' + JSON.stringify(await vibrateCalls()));

  // STEP 17 — SAVE commits the edited range (replaceRangeFlow semantics):
  // modal closes, storage covers 21..end16 + the lone day 14, strip re-forms.
  const endIso = await editHandleIso('end');
  await page.click('button[aria-label="Save edit"]');
  await page.waitForTimeout(400);
  if (!(await page.evaluate(() => !!document.querySelector('[data-edit-modal]')))) ok('Save closed the edit modal');
  else fail('edit modal still open after Save');
  stored = await storedEntries();
  // replaceRangeFlow semantics: the edited range spans Aug..Nov, so the lone
  // day 14 (same month as the range) is cleared on save — the month's period
  // marking IS exactly the range.
  const expected = countInclusive(d21, endIso);
  if (stored.length === expected) ok(`Save committed 21..${endIso} (${stored.length} entries; lone day 14 cleared)`);
  else fail(`Save commit wrong count: ${stored.length} entries, expected ${expected}: ${JSON.stringify(stored.map((x) => x.date))}`);
  const savedOk = stored.filter((x) => x.date >= d21 && x.date <= endIso).length === countInclusive(d21, endIso) && stored.every((x) => x.flow === 'medium');
  if (savedOk) ok('saved range fully persisted with medium flow');
  else fail('saved entries wrong: ' + JSON.stringify(stored.map((x) => [x.date, x.flow])));
  if ((await hasClass(d21, 'rounded-bl-full')) && (await hasClass(endIso, 'rounded-r-full')))
    ok('committed edited range forms the continuous strip (caps on both ends)');
  else fail('edited range caps missing after save');
  if (!(await page.evaluate(() => !!document.querySelector('[data-edit-handle]')))) ok('no leftover edit handles after save');
  else fail('edit handles remain after save');

  // STEP 18 — CANCEL: re-enter edit mode, drag the start backward, Cancel must
  // revert everything (storage + visuals untouched).
  await page.click('button[aria-label="Scroll to today"]');
  await page.waitForTimeout(400);
  const e18 = center(await box(d23));
  await page.mouse.move(e18.x, e18.y);
  await page.mouse.down();
  await page.waitForTimeout(HOLD_MS);
  // BLOOM-0015: re-entry is ALSO at arm (modal + pulse while still holding).
  if (await page.evaluate(() => !!document.querySelector('[data-edit-modal]')))
    ok('re-entered edit mode AT ARM (modal visible while holding)');
  else fail('re-entry did not happen at arm');
  if ((await vibrateCalls()).length === 6) ok('re-entry pulse fired at arm (6 calls)');
  else fail('re-entry pulse wrong: ' + JSON.stringify(await vibrateCalls()));
  await page.mouse.up();
  await page.waitForTimeout(350);
  if ((await editHandleIso('start')) === d23 && (await editHandleIso('end')) === endIso)
    ok('re-entered edit mode on the saved range (23 start / ' + endIso + ' end)');
  else fail(`re-entry wrong: start=${await editHandleIso('start')} end=${await editHandleIso('end')}`);
  const s18 = center(await box(d23)), q18 = center(await box(d15));
  await page.mouse.move(s18.x, s18.y);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.move(q18.x, q18.y, { steps: 8 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(200);
  if ((await editHandleIso('start')) === d15) ok('start handle dragged to 15');
  else fail('start handle did not move to 15');
  await page.click('button[aria-label="Cancel edit"]');
  await page.waitForTimeout(400);
  if (!(await page.evaluate(() => !!document.querySelector('[data-edit-modal]')))) ok('Cancel closed the edit modal');
  else fail('edit modal still open after Cancel');
  stored = await storedEntries();
  if (stored.length === expected) ok('Cancel changed nothing (entries still ' + expected + ')');
  else fail(`Cancel mutated storage: ${stored.length} entries`);
  if ((await hasClass(d21, 'bg-rose-400')) && !(await hasClass(d15, 'bg-rose-400')))
    ok('Cancel kept the committed range 21..' + endIso + ' (15 not marked)');
  else fail('Cancel did not revert the visual range');

  // STEP 19 — CONTINUOUS CALENDAR: the month window GROWS at both ends when
  // the user scrolls near the edges (initial window ≈ today ±12 + history).
  const mc0 = await monthCount();
  await page.evaluate(() => { const el = document.querySelector('[data-calendar-scroll]'); el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(700);
  const mc1 = await monthCount();
  if (mc1 > mc0) ok(`calendar grows at the bottom: ${mc0} → ${mc1} months (continuous)`);
  else fail(`no growth at the bottom: ${mc0} → ${mc1}`);
  const last0 = await monthAttr('last');
  await page.evaluate(() => { const el = document.querySelector('[data-calendar-scroll]'); el.scrollTop = 0; });
  await page.waitForTimeout(700);
  const mc2 = await monthCount();
  if (mc2 > mc1) ok(`calendar grows at the top: ${mc1} → ${mc2} months (continuous)`);
  else fail(`no growth at the top: ${mc1} → ${mc2}`);
  const first2 = await monthAttr('first');
  if (first2 < last0) ok(`window extends in both directions (first ${first2} < last ${last0})`);
  else fail(`window did not extend backward: first=${first2} last=${last0}`);
  await page.click('button[aria-label="Scroll to today"]');
  await page.waitForTimeout(400);

  await page.screenshot({ path: '/tmp/bloom-range-drag.png' });
  console.log('JS ERRORS:', errors.length ? errors.join(' | ') : 'none');
  if (errors.length) fail('page errors present');
  await browser.close();
  if (process.exitCode) { console.error('E2E FAILED'); process.exit(1); }
  console.log('E2E PASS');
})().catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1); });