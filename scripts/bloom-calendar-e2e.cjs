// Bloom scrollable calendar E2E — months list, initial scroll to today,
// INFINITE back-scroll (auto-loads months at the top, no cap/button),
// historical ovulation/fertile markers on past months, note symbols,
// day tap → cycle-day dialog → notes form, range extension to old entries,
// Today pill re-scroll.
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
// 0-based month string "Y-M" from a date's 12-month index
const monthStr = (i) => `${Math.floor(i / 12)}-${((i % 12) + 12) % 12}`;

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
  const oldDay = isoAdd(today, -400); // ~13 months back → forces infinite back-scroll
  const B = isoAdd(today, -60);       // second-to-last cycle start
  const C = isoAdd(today, -30);       // last cycle start
  const [todayY, todayM1] = today.split('-').map(Number);
  // data-month attributes are 0-based months — the 1-based calendar month would
  // match the NEXT month's section (classic "346px offset" phantom).
  const todayM = todayM1 - 1;
  const oldY = +oldDay.slice(0, 4), oldM = +oldDay.slice(5, 7) - 1;
  const em = oldY * 12 + oldM - 1; // one month before earliest entry
  const expFirst = monthStr(em);
  const initialFirst = monthStr(todayY * 12 + todayM - 6); // PAST_MONTHS=6 back

  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });

  // STEP 1 — seed: an old period > a year back, two completed cycles in the
  // last two months (interval 30d each), and a period that started today.
  // Today also carries a note (for the note-symbol assert); oldDay has none.
  // Historical ovulation estimate for the second cycle = C − 14 = today−44,
  // fertile window [today−49, today−43]. The oldDay→B gap (340d) is an
  // outlier → the first cycle gets NO estimate.
  const entries = [
    { date: oldDay, flow: 'medium', symptoms: [], notes: '' },
    ...[0, 1, 2].map((n) => ({ date: isoAdd(B, n), flow: 'medium', symptoms: [], notes: '' })),
    ...[0, 1, 2].map((n) => ({ date: isoAdd(C, n), flow: 'medium', symptoms: [], notes: '' })),
    { date: today, flow: 'light', symptoms: [], notes: 'Cramps at noon' }
  ];
  await page.evaluate((entries) => {
    localStorage.setItem('bloom.snapshot.v1', JSON.stringify({
      version: 1,
      entries,
      updatedAt: new Date().toISOString()
    }));
  }, entries);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForTimeout(700); // allow initial scroll rAF

  // STEP 2 — initial window is bounded: 6 months back, current month present,
  // and the >1-year-old entry is NOT yet loaded (history loads on demand).
  const months0 = await page.evaluate(() =>
    [...document.querySelectorAll('[data-month]')].map((el) => el.getAttribute('data-month')));
  if (months0.length >= 7) ok(`initial window renders ${months0.length} month sections`);
  else fail('initial window too small: ' + months0.length);
  if (months0[0] === initialFirst) ok(`initial window starts at ${initialFirst} (6 months back)`);
  else fail(`initial window starts at ${months0[0]}, expected ${initialFirst}`);
  if (months0.includes(`${todayY}-${todayM}`)) ok('current month rendered in initial window');
  else fail('current month missing from initial window');
  const oldCount0 = await page.locator(`button[aria-label="${oldDay}"]`).count();
  if (oldCount0 === 0) ok('>1-year-old entry NOT loaded initially (bounded start, no cap on growth)');
  else fail('old entry unexpectedly loaded at rest');

  // STEP 2b — INFINITE BACK-SCROLL: driving the box to the top must prepend
  // months automatically, repeatedly, until the >1-year-old entry is loaded.
  // No "Load older" button, no stop at 6 months.
  const monthNum = (s) => { const q = s.split('-').map(Number); return q[0] * 12 + q[1]; };
  await page.evaluate(async (expFirst) => {
    const s = document.querySelector('[data-calendar-scroll]');
    const first = () => {
      const el = document.querySelector('[data-month]');
      return el ? el.getAttribute('data-month') : '9999-0';
    };
    const num = (x) => { const q = x.split('-').map(Number); return q[0] * 12 + q[1]; };
    for (let i = 0; i < 10 && num(first()) > num(expFirst); i++) {
      s.scrollTop = 0;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise((r) => setTimeout(r, 60));
    }
  }, expFirst);
  const months = await page.evaluate(() =>
    [...document.querySelectorAll('[data-month]')].map((el) => el.getAttribute('data-month')));
  if (monthNum(months[0]) <= monthNum(expFirst)) ok(`scroll-to-top auto-loaded history back to ${months[0]} (≥ ${expFirst})`);
  else fail(`auto-load stalled: first month ${months[0]}, expected ≤ ${expFirst}`);
  const oldCount = await page.locator(`button[aria-label="${oldDay}"]`).count();
  if (oldCount === 1) ok('oldest entry rendered after infinite back-scroll');
  else fail('oldest entry missing after auto-load');

  // STEP 2c — CONTINUOUS STRIP: day cells in DOM order are one unbroken chain
  // of consecutive dates across month boundaries (no padded restart), and each
  // month's 1st carries a superscript month label.
  const chain = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('[data-calendar-scroll] button[aria-label]')]
      .map((b) => b.getAttribute('aria-label'))
      .filter((l) => /^\d{4}-\d{2}-\d{2}$/.test(l));
    for (let i = 1; i < buttons.length; i++) {
      const prev = buttons[i - 1].split('-').map(Number);
      const cur = buttons[i].split('-').map(Number);
      const dPrev = new Date(Date.UTC(prev[0], prev[1] - 1, prev[2]));
      const dCur = new Date(Date.UTC(cur[0], cur[1] - 1, cur[2]));
      if ((dCur - dPrev) / 86400000 !== 1) return { chainBrokenAt: buttons[i] };
    }
    return { chainBrokenAt: null, count: buttons.length };
  });
  if (chain.chainBrokenAt === null) ok(`day cells form one unbroken chain (${chain.count} cells)`);
  else fail('day cells not continuous across month boundary: ' + JSON.stringify(chain));

  // STEP 2d — month labels on every 1st (upper-case abbreviation), the
  // current month's label rendered and uppercased via CSS.
  const labels = await page.evaluate(({ todayY, todayM, expectSup }) => {
    const rows = [...document.querySelectorAll('[data-month]')];
    let labeled = 0, todayAbbr = null, todayUp = null;
    for (const row of rows) {
      const m = row.getAttribute('data-month'); // 0-based "Y-M"
      const [y, mm] = m.split('-').map(Number);
      const btn = row.querySelector(`button[aria-label="${y}-${String(mm + 1).padStart(2, '0')}-01"]`);
      if (!btn) continue;
      const abbr = [...btn.querySelectorAll('span')]
        .map((s) => s.textContent.trim())
        .find((t) => /^[A-Z][a-z]{2}$/.test(t));
      if (abbr) {
        labeled++;
        if (m === `${todayY}-${todayM}`) {
          todayAbbr = abbr;
          const spans = [...btn.querySelectorAll('span')].filter((s) => s.textContent.trim() === abbr);
          todayUp = spans[0] ? getComputedStyle(spans[0]).textTransform : null;
        }
      }
    }
    return { rows: rows.length, labeled, todayAbbr, todayUp };
  }, { todayY, todayM, expectSup: 'Sep' });
  const expectSup = new Date(todayY, todayM, 1).toLocaleDateString('en-US', { month: 'short' });
  if (labels.rows > 0 && labels.labeled === labels.rows && labels.todayAbbr === expectSup && labels.todayUp === 'uppercase')
    ok(`month labels on every month 1st (${labels.labeled}/${labels.rows}; today month ${labels.todayAbbr} → ${labels.todayUp})`);
  else fail('month labels wrong: ' + JSON.stringify(labels) + ' expected ' + expectSup);

  // STEP 2e — HISTORICAL OVULATION ESTIMATES: past months carry fertile-window
  // fill around the retrospectively computed ovulation (second cycle:
  // ovulation = C − 14 = today−44, window [today−49, today−43] — actual
  // observed 30d gap, not the average). Days outside any window stay plain.
  const ov1 = isoAdd(C, -14);
  const fertileDay = isoAdd(ov1, -3); // inside the window
  const controlDay = isoAdd(today, -25); // between window [−49,−43] and [−19,−13]
  const marks = await page.evaluate(({ fertileDay, controlDay }) => {
    const bg = (iso) => {
      const el = document.querySelector(`button[aria-label="${iso}"]`);
      return el ? getComputedStyle(el).backgroundColor : null;
    };
    return { fertile: bg(fertileDay), control: bg(controlDay) };
  }, { fertileDay, controlDay });
  if (marks.fertile === 'rgb(228, 220, 243)') ok(`historical fertile window painted on ${fertileDay} (${marks.fertile})`);
  else fail('historical fertile fill missing: ' + JSON.stringify(marks.fertile));
  if (marks.control === 'rgba(0, 0, 0, 0)' || marks.control === 'transparent') ok(`unmarked day ${controlDay} stays unpainted`);
  else fail(`unexpected fill on ${controlDay}: ${marks.control}`);
  const legend = await page.evaluate(() => [...document.querySelectorAll('[data-legend]')].map((el) => el.getAttribute('data-legend')));
  if (legend.includes('fertile') && legend.includes('ovulation'))
    ok(`legend shows fertile + ovulation (${legend.join(',')})`);
  else fail('legend missing fertile/ovulation: ' + legend.join(','));

  // STEP 2f — note symbol: days WITH a note carry a note pen glyph; days
  // without one don't. Seeded: today has 'Cramps at noon', oldDay has none.
  const notes = await page.evaluate(({ today, oldDay }) => {
    const cell = (iso) => document.querySelector(`[data-calendar-scroll] button[aria-label="${iso}"]`);
    const withNote = cell(today);
    const without = cell(oldDay);
    return {
      todayHasIcon: !!withNote && withNote.querySelector('svg[aria-hidden]') !== null,
      todayIconCount: withNote ? withNote.querySelectorAll('svg[aria-hidden]').length : 0,
      oldHasIcon: !!without && without.querySelector('svg[aria-hidden]') !== null,
    };
  }, { today, oldDay });
  if (notes.todayHasIcon && notes.todayIconCount === 1 && !notes.oldHasIcon)
    ok('note symbol on day with note, absent on day without');
  else fail('note symbol wrong: ' + JSON.stringify(notes));

  // STEP 2g — the infinite back-scroll left the box at the top of history;
  // reposition to the current month before the scrollbox checks below.
  await page.click('button[aria-label="Scroll to today"]');
  await page.waitForTimeout(400);

  // STEP 3 — calendar scrolls inside its own box; the PAGE must not scroll for months
  const box = await page.evaluate(() => {
    const s = document.querySelector('[data-calendar-scroll]');
    return {
      overflowY: getComputedStyle(s).overflowY,
      clientH: s.clientHeight,
      scrollH: s.scrollHeight,
    };
  });
  if (box.overflowY === 'auto') ok('calendar box overflow-y auto (inner scroll)');
  else fail('calendar box overflow-y: ' + box.overflowY);
  if (box.scrollH > box.clientH) ok(`box is scrollable (client ${box.clientH}px < content ${box.scrollH}px)`);
  else fail('box not scrollable: client=' + box.clientH + ' scroll=' + box.scrollH);

  // ...and the document itself has no vertical scrollbar (root scroll range 0);
  // the calendar box absorbs the slack. Regression guard for root-level
  // scrollbar bug. (Aggressive guard: the pre-existing BLOOM-0028 fix.)
  const docRange = await page.evaluate(() => {
    const de = document.documentElement;
    return { docH: de.scrollHeight, innerH: window.innerHeight };
  });
  if (docRange.docH - docRange.innerH === 0) ok(`calendar tab has NO root scroll range (doc ${docRange.docH} == viewport ${docRange.innerH})`);
  else fail('calendar tab root scroll range: doc=' + docRange.docH + ' viewport=' + docRange.innerH);

  // STEP 3b — initial scroll: the inner box scrolled to the current month,
  // never the page.
  const pos = await page.evaluate(({ todayY, todayM }) => {
    const scroller = document.querySelector('[data-calendar-scroll]');
    const el = document.querySelector(`[data-month="${todayY}-${todayM}"]`);
    const sr = scroller.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return {
      scrollY: Math.round(window.scrollY),
      scrollTop: Math.round(scroller.scrollTop),
      monthTop: Math.round(r.top - sr.top),
      boxH: Math.round(sr.height),
      maxScroll: scroller.scrollHeight - scroller.clientHeight,
    };
  }, { todayY, todayM });
  if (pos.scrollY < 100) ok('page did NOT scroll (scrollY=' + pos.scrollY + ')');
  else fail('page scrolled for calendar: scrollY=' + pos.scrollY);
  if (pos.scrollTop > 500) ok('calendar box scrolled to current month (scrollTop=' + pos.scrollTop + ')');
  else fail('calendar box not scrolled: scrollTop=' + pos.scrollTop);
  if (pos.monthTop >= -10 && pos.monthTop < pos.boxH) ok('current month visible in calendar box (top=' + pos.monthTop + ' of ' + pos.boxH + 'px box, maxScroll ' + pos.maxScroll + ')');
  else fail('current month not visible in box: top=' + pos.monthTop + ' boxH=' + pos.boxH);

  // STEP 3c — taller viewport must show MORE calendar: the box grows with the
  // screen, and the root must STAY unscrollable (slack absorbed by the box).
  await page.setViewportSize({ width: 430, height: 1300 });
  await page.waitForTimeout(250);
  const grown = await page.evaluate(() => {
    const s = document.querySelector('[data-calendar-scroll]');
    const de = document.documentElement;
    return { height: Math.round(s.getBoundingClientRect().height), docH: de.scrollHeight, innerH: window.innerHeight };
  });
  if (grown.height > 700 && grown.docH - grown.innerH === 0) ok(`box grows with viewport (${box.clientH}px @ 932 → ${grown.height}px @ 1300) and root stays unscrollable`);
  else fail('box did not grow with viewport: ' + JSON.stringify(grown));
  await page.setViewportSize({ width: 430, height: 932 });
  await page.waitForTimeout(250);

  // STEP 4 — tap old period day (scrolled away) → cycle-day summary dialog →
  // "Open notes & mood" → DaySheet for that date.
  await page.click(`button[aria-label="${oldDay}"]`);
  await page.waitForTimeout(300);
  const oldTitle = new Date(oldY, oldM, +oldDay.slice(8)).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric' });
  const dialog = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    return d ? { label: d.getAttribute('aria-label') || '', text: d.textContent || '' } : null;
  });
  if (dialog && dialog.label.includes(oldTitle)) ok(`old day tap opens cycle-day dialog (${oldTitle})`);
  else fail('cycle-day dialog for old day missing: ' + JSON.stringify(dialog));
  await page.click('button:has-text("Open notes")');
  await page.waitForTimeout(300);
  const sheet = await page.evaluate(() => document.body.innerText);
  if (sheet.includes(oldTitle) && sheet.toUpperCase().includes('PERIOD FLOW')) ok('notes form opens from dialog (' + oldTitle + ')');
  else fail('notes form for old day missing: ' + JSON.stringify(sheet.slice(0, 120)));
  await page.click('button[aria-label="Close"]');
  await page.waitForTimeout(300);

  // STEP 5 — Today pill scrolls box back to current month (page stays put)
  await page.click('button[aria-label="Scroll to today"]');
  await page.waitForTimeout(500);
  const back = await page.evaluate(({ todayY, todayM }) => {
    const scroller = document.querySelector('[data-calendar-scroll]');
    const el = document.querySelector(`[data-month="${todayY}-${todayM}"]`);
    const sr = scroller.getBoundingClientRect();
    return { monthTop: Math.round(el.getBoundingClientRect().top - sr.top), boxH: Math.round(sr.height), scrollY: Math.round(window.scrollY) };
  }, { todayY, todayM });
  if (back.monthTop >= -10 && back.monthTop < back.boxH) ok('Today pill re-scrolls box to current month (top=' + back.monthTop + ' of ' + back.boxH + 'px box)');
  else fail('Today pill scroll failed: top=' + back.monthTop + ' scrollY=' + back.scrollY);
  if (back.scrollY < 100) ok('page still not scrolled by Today pill (scrollY=' + back.scrollY + ')');
  else fail('Today pill scrolled page: scrollY=' + back.scrollY);

  // STEP 6 — LONG-PRESS + drag across days creates a period range (start → end),
  // highlighted live while dragging, committed as flow on mouseup; no dialog.
  // (Selection arms only after a ~400ms hold — the long-press gate in rangeDrag.ts.)
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
    await page.waitForTimeout(600); // hold arms the selection (long-press gate)
    await page.mouse.move(dm.x + dm.width / 2, dm.y + dm.height / 2, { steps: 6 });
    await page.waitForTimeout(120);
    const midCls = await page.evaluate((iso) => {
      const el = document.querySelector(`button[aria-label="${iso}"]`);
      return el ? el.className : '';
    }, dragMidISO);
    if (midCls.includes('bg-rose-400') || midCls.includes('font-bold'))
      ok(`live drag highlight spans range (mid ${dragMidISO})`);
    else fail('mid-drag highlight missing: ' + midCls.slice(0, 160));
    await page.mouse.move(d2.x + d2.width / 2, d2.y + d2.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(350);
    const dialogAfter = await page.evaluate(() => document.querySelector('[role="dialog"]') !== null);
    if (!dialogAfter) ok('drag commits range without opening dialog');
    else fail('drag opened dialog');
    const rose = await page.evaluate((isos) => {
      return isos.map((iso) => {
        const el = document.querySelector(`button[aria-label="${iso}"]`);
        return el ? (el.className.includes('bg-rose-400') || el.className.includes('font-bold')) : false;
      });
    }, [dragStartISO, dragMidISO, dragEndISO]);
    if (rose.every(Boolean)) ok(`committed range fully highlighted (${dragStartISO}..${dragEndISO})`);
    else fail('range not fully highlighted after commit: ' + JSON.stringify(rose));
    const stored = await page.evaluate(({ a, b }) => {
      const snap = JSON.parse(localStorage.getItem('bloom.snapshot.v1'));
      return snap.entries.filter((e) => e.date >= a && e.date <= b);
    }, { a: dragStartISO, b: dragEndISO });
    const rangeLen = 5;
    if (stored.length === rangeLen && stored.every((e) => e.flow === 'medium'))
      ok(`range persisted as ${rangeLen} flow days (medium default)`);
    else fail('range entries wrong: ' + JSON.stringify(stored.map((e) => e.date + ':' + e.flow)));
    // click still works post-drag: day before range opens the cycle dialog
    const clickDay = isoAdd(dragStartISO, -1);
    await page.click(`button[aria-label="${clickDay}"]`);
    await page.waitForTimeout(300);
    const dialog2 = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      return d ? (d.getAttribute('aria-label') || '') : '';
    });
    if (dialog2.includes('cycle day')) ok('plain click after drag still opens cycle-day dialog');
    else fail('click after drag did not open dialog: ' + dialog2);
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
