// Bloom scrollable calendar E2E — months list, initial scroll to today,
// range extension to old entries, day tap → DaySheet, Today pill re-scroll.
// Prereq: dev server (bun run dev --port 5174), then:
//   NODE_PATH=/mnt/c/Repos/bookmarker/node_modules node bloom-calendar-e2e.cjs
// Port override (e.g. when a sibling session holds 5174): BLOOM_BASE_URL=http://localhost:5176/
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
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  const fail = (msg) => { console.error('ASSERT FAIL:', msg); process.exitCode = 1; };
  const ok = (msg) => console.log('ok -', msg);

  const today = localISO(new Date());
  const oldDay = isoAdd(today, -400); // ~13 months back → forces range extension
  const [todayY, todayM1] = today.split('-').map(Number);
  // data-month attributes are 0-based months — the 1-based calendar month would
  // match the NEXT month's section (classic "346px offset" phantom).
  const todayM = todayM1 - 1;
  const oldY = +oldDay.slice(0, 4), oldM = +oldDay.slice(5, 7) - 1;
  const em = oldY * 12 + oldM - 1; // one month before earliest entry
  const expFirst = `${Math.floor(em / 12)}-${((em % 12) + 12) % 12}`;

  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });

  // STEP 1 — seed: one old period day + one today entry
  await page.evaluate(({ oldDay, today }) => {
    localStorage.setItem('bloom.snapshot.v1', JSON.stringify({
      version: 1,
      entries: [
        { date: oldDay, flow: 'medium', symptoms: [], notes: '' },
        { date: today, flow: 'light', symptoms: [], notes: '' }
      ],
      updatedAt: new Date().toISOString()
    }));
  }, { oldDay, today });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForTimeout(700); // allow initial scroll rAF

  // STEP 2 — multiple month sections, oldest extended back before the entry
  const months = await page.evaluate(() =>
    [...document.querySelectorAll('[data-month]')].map((el) => el.getAttribute('data-month')));
  if (months.length >= 25) ok(`calendar renders ${months.length} scrollable months`);
  else fail('expected >= 25 months, got ' + months.length);
  if (months[0] === expFirst) ok(`range extended back to ${expFirst} (before ${oldDay})`);
  else fail(`first month ${months[0]}, expected ${expFirst}`);

  // STEP 3 — calendar scrolls inside its own box; the PAGE must not scroll for months
  const box = await page.evaluate(() => {
    const s = document.querySelector('[data-calendar-scroll]');
    const cs = getComputedStyle(s);
    const r = s.getBoundingClientRect();
    return {
      height: Math.round(r.height),
      overflowY: cs.overflowY,
      clientH: s.clientHeight,
      scrollH: s.scrollHeight,
    };
  });
  if (box.height >= 300 && box.height <= 400) ok(`calendar box ≈ one month tall (${box.height}px)`);
  else fail('calendar box height not ~1 month: ' + box.height);
  if (box.overflowY === 'auto') ok('calendar box overflow-y auto (inner scroll)');
  else fail('calendar box overflowY=' + box.overflowY);
  if (box.scrollH > box.clientH) ok(`box is scrollable (client ${box.clientH}px < content ${box.scrollH}px)`);
  else fail('box not scrollable: client=' + box.clientH + ' scroll=' + box.scrollH);

  const pos = await page.evaluate(({ todayY, todayM }) => {
    const scroller = document.querySelector('[data-calendar-scroll]');
    const el = document.querySelector(`[data-month="${todayY}-${todayM}"]`);
    const sr = scroller.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { scrollY: Math.round(window.scrollY), scrollTop: Math.round(scroller.scrollTop), monthTop: Math.round(r.top - sr.top) };
  }, { todayY, todayM });
  if (pos.scrollY < 100) ok('page did NOT scroll (scrollY=' + pos.scrollY + ')');
  else fail('page scrolled for calendar: scrollY=' + pos.scrollY);
  if (pos.scrollTop > 500) ok('calendar box scrolled to current month (scrollTop=' + pos.scrollTop + ')');
  else fail('calendar box not scrolled: scrollTop=' + pos.scrollTop);
  if (pos.monthTop >= -10 && pos.monthTop < 120) ok('current month at top of calendar box (top=' + pos.monthTop + ')');
  else fail('current month not at box top: top=' + pos.monthTop);

  // STEP 4 — tap old period day (scrolled away) → DaySheet for that date
  await page.click(`button[aria-label="${oldDay}"]`);
  await page.waitForTimeout(300);
  const sheet = await page.evaluate(() => document.body.innerText);
  const oldTitle = new Date(oldY, oldM, +oldDay.slice(8)).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric' });
  if (sheet.includes(oldTitle) && sheet.toUpperCase().includes('PERIOD FLOW')) ok('old day tap opens DaySheet (' + oldTitle + ')');
  else fail('DaySheet for old day missing: ' + JSON.stringify(sheet.slice(0, 120)));
  await page.click('button[aria-label="Close"]');
  await page.waitForTimeout(300);

  // STEP 5 — Today pill scrolls box back to current month (page stays put)
  await page.click('button[aria-label="Scroll to today"]');
  await page.waitForTimeout(500);
  const back = await page.evaluate(({ todayY, todayM }) => {
    const scroller = document.querySelector('[data-calendar-scroll]');
    const el = document.querySelector(`[data-month="${todayY}-${todayM}"]`);
    const sr = scroller.getBoundingClientRect();
    return { monthTop: Math.round(el.getBoundingClientRect().top - sr.top), scrollY: Math.round(window.scrollY) };
  }, { todayY, todayM });
  if (back.monthTop >= -10 && back.monthTop < 120) ok('Today pill re-scrolls box to current month (top=' + back.monthTop + ')');
  else fail('Today pill scroll failed: top=' + back.monthTop + ' scrollY=' + back.scrollY);
  if (back.scrollY < 100) ok('page still not scrolled by Today pill (scrollY=' + back.scrollY + ')');
  else fail('Today pill scrolled page: scrollY=' + back.scrollY);

  // STEP 6 — click-drag across days creates a period range (start → end),
  // highlighted live while dragging, committed as flow on mouseup; DaySheet stays closed.
  let dragStartISO = `${todayY}-${pad(todayM + 1)}-12`;
  let dragMidISO = `${todayY}-${pad(todayM + 1)}-14`;
  let dragEndISO = `${todayY}-${pad(todayM + 1)}-16`;
  if (`${todayY}-${pad(todayM + 1)}-12` === today) {
    // month day 12 collides with today's seeded entry — pick days 20..24 instead
    dragStartISO = `${todayY}-${pad(todayM + 1)}-20`;
    dragMidISO = `${todayY}-${pad(todayM + 1)}-22`;
    dragEndISO = `${todayY}-${pad(todayM + 1)}-24`;
  }
  const d1 = await page.locator(`button[aria-label="${dragStartISO}"]`).boundingBox();
  const dm = await page.locator(`button[aria-label="${dragMidISO}"]`).boundingBox();
  const d2 = await page.locator(`button[aria-label="${dragEndISO}"]`).boundingBox();
  if (!d1 || !dm || !d2) fail(`drag days not rendered (${dragStartISO}, ${dragMidISO}, ${dragEndISO})`);
  else {
    await page.mouse.move(d1.x + d1.width / 2, d1.y + d1.height / 2);
    await page.mouse.down();
    await page.mouse.move(dm.x + dm.width / 2, dm.y + dm.height / 2, { steps: 6 });
    await page.waitForTimeout(120);
    const midCls = await page.evaluate((iso) => {
      const el = document.querySelector(`button[aria-label="${iso}"]`);
      return el ? el.className : '';
    }, dragMidISO);
    if (midCls.includes('bg-rose-400')) ok(`live drag highlight spans range (mid ${dragMidISO} rose)`);
    else fail('mid-drag highlight missing: ' + midCls.slice(0, 160));
    await page.mouse.move(d2.x + d2.width / 2, d2.y + d2.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(350);
    const sheetAfter = await page.evaluate(() => document.body.innerText.includes('PERIOD FLOW'));
    if (!sheetAfter) ok('drag commits range without opening DaySheet');
    else fail('drag opened DaySheet');
    const rose = await page.evaluate((isos) => {
      return isos.map((iso) => {
        const el = document.querySelector(`button[aria-label="${iso}"]`);
        return el ? el.className.includes('bg-rose-400') : false;
      });
    }, [dragStartISO, dragMidISO, dragEndISO]);
    if (rose.every(Boolean)) ok(`committed range fully highlighted rose (${dragStartISO}..${dragEndISO})`);
    else fail('range not fully rose after commit: ' + JSON.stringify(rose));
    const stored = await page.evaluate(({ a, b }) => {
      const snap = JSON.parse(localStorage.getItem('bloom.snapshot.v1'));
      return snap.entries.filter((e) => e.date >= a && e.date <= b);
    }, { a: dragStartISO, b: dragEndISO });
    const rangeLen = 5;
    if (stored.length === rangeLen && stored.every((e) => e.flow === 'medium'))
      ok(`range persisted as ${rangeLen} flow days (medium default)`);
    else fail('range entries wrong: ' + JSON.stringify(stored.map((e) => e.date + ':' + e.flow)));
    // click still works post-drag: day before range opens DaySheet
    const clickDay = isoAdd(dragStartISO, -1);
    await page.click(`button[aria-label="${clickDay}"]`);
    await page.waitForTimeout(300);
    const sheet2 = await page.evaluate(() => document.body.innerText);
    if (sheet2.toUpperCase().includes('PERIOD FLOW')) ok('plain click after drag still opens DaySheet');
    else fail('click after drag did not open DaySheet');
    await page.click('button[aria-label="Close"]');
    await page.waitForTimeout(300);
  }

  await page.screenshot({ path: '/tmp/bloom-calendar-scrollable.png' });
  console.log('JS ERRORS:', errors.length ? errors.join(' | ') : 'none');
  if (errors.length) fail('page errors present');
  await browser.close();
  if (process.exitCode) { console.error('E2E FAILED'); process.exit(1); }
  console.log('E2E PASS');
})().catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1); });
