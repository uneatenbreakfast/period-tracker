// Bloom TrendsCard E2E — seed 6 cycles (reference screens dates), verify stats,
// cycle rows, bar segments + icons, expand detail, tab switch back to calendar.
// Prereq: dev server on :5174 (bun run dev --port 5174), then:
//   NODE_PATH=/mnt/c/Repos/bookmarker/node_modules node bloom-trends-e2e.js
const { chromium } = require('playwright');
const BASE = process.env.BLOOM_BASE_URL || 'http://localhost:5174/';

const cycles = [
  { start: '2026-03-15', days: 6 },
  { start: '2026-04-10', days: 5 },
  { start: '2026-05-05', days: 6 },
  { start: '2026-05-31', days: 5 },
  { start: '2026-06-23', days: 5 },
  { start: '2026-07-21', days: 5 },
];

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

  const isoAdd = (iso, n) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
  };

  const seed = [];
  cycles.forEach(({ start, days }) => {
    for (let i = 0; i < days; i++) seed.push({ date: isoAdd(start, i), flow: i % 2 ? 'medium' : 'light', symptoms: [] });
  });

  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.evaluate((seed) => {
    localStorage.setItem('bloom.snapshot.v1', JSON.stringify({ version: 1, entries: seed, updatedAt: new Date().toISOString() }));
  }, seed);
  await page.reload({ waitUntil: 'networkidle0' });

  // STEP 1 — tabs present, trends switch
  const tabs = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Views"]');
    return nav ? [...nav.querySelectorAll('button')].map((b) => b.textContent.trim()) : [];
  });
  if (tabs.join(',') === 'Calendar,Health,Trends') ok('tabs CALENDAR | HEALTH | TRENDS present (uppercased by CSS)');
  else fail('tabs wrong: ' + JSON.stringify(tabs));

  await page.click('nav[aria-label="Views"] button:has-text("Trends")');
  await page.waitForTimeout(250);
  const bodyC = await page.evaluate(() => document.body.innerText);
  if (bodyC.toUpperCase().includes('MY CYCLES')) ok('trends tab shows MY CYCLES heading');
  else fail('MY CYCLES heading missing');

  // STEP 2 — stat tiles
  const stats = await page.evaluate(() => {
    const get = (id) => {
      const el = document.querySelector(`[data-testid="${id}"]`);
      return el ? el.innerText.replace(/\n/g, ' ') : null;
    };
    return { period: get('stat-period'), ovulation: get('stat-ovulation'), cycle: get('stat-cycle') };
  });
  if (stats.period && stats.period.includes('5') && stats.period.includes('Days')) ok('avg period length 5 Days: ' + stats.period);
  else fail('stat-period wrong: ' + JSON.stringify(stats.period));
  if (stats.ovulation && stats.ovulation.includes('13th') && stats.ovulation.includes('Day')) ok('avg ovulation 13th Day: ' + stats.ovulation);
  else fail('stat-ovulation wrong: ' + JSON.stringify(stats.ovulation));
  if (stats.cycle && stats.cycle.includes('26') && stats.cycle.includes('Days')) ok('avg cycle length 26 Days: ' + stats.cycle);
  else fail('stat-cycle wrong: ' + JSON.stringify(stats.cycle));

  // STEP 3 — 6 rows, newest first; row payload matches reference
  const rows = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="cycle-row-"]')].map((r) => r.innerText.replace(/\n/g, ' ')));
  if (rows.length === 6) ok('6 cycle rows');
  else fail('expected 6 rows, got ' + rows.length);
  if (rows[0] && rows[0].includes('21 Jul - 15 Aug') && rows[0].includes('Period: 5 Days') && rows[0].includes('Ovulation: 13th Day') && rows[0].includes('Cycle length: 26 Days')) {
    ok('newest row: 21 Jul - 15 Aug | Period 5 | Ovulation 13th | Cycle 26 (predicted avg)');
  } else fail('newest row wrong: ' + JSON.stringify(rows[0]));
  const oldest = rows[rows.length - 1] || '';
  if (oldest.includes('15 Mar - 9 Apr') && oldest.includes('Period: 6 Days')) ok('oldest row: 15 Mar - 9 Apr | Period 6');
  else fail('oldest row wrong: ' + JSON.stringify(oldest));
  if (rows[1].includes('23 Jun - 20 Jul') && rows[1].includes('Ovulation: 15th Day') && rows[1].includes('Cycle length: 28 Days')) ok('second row: 23 Jun - 20 Jul | Ovul 15 | 28 days');
  else fail('second row wrong: ' + JSON.stringify(rows[1]));

  // STEP 4 — bar segments + icons on newest row
  const bar = await page.evaluate(() => {
    const container = document.querySelector('[data-testid="cycle-bar-2026-07-21"]');
    if (!container) return null;
    const period = container.querySelector('[data-testid="cycle-bar-period"]');
    const fertile = container.querySelector('[data-testid="cycle-bar-fertile"]');
    const droplet = container.querySelector('svg[aria-label="Period start"]');
    const heart = container.querySelector('svg[aria-label="Ovulation day"]');
    const heartLeft = heart ? parseFloat(heart.style.left) : null;
    return {
      periodW: period ? parseFloat(period.style.width) : null,
      fertile: !!fertile,
      fertileLeft: fertile ? parseFloat(fertile.style.left) : null,
      droplet: !!droplet,
      heart: !!heart,
      heartLeft
    };
  });
  if (!bar) fail('newest cycle bar missing');
  else {
    if (Math.abs(bar.periodW - (5 / 26) * 100) < 0.5) ok(`period segment ${bar.periodW.toFixed(1)}% ≈ 5/26`);
    else fail('period segment width wrong: ' + bar.periodW);
    if (bar.fertile) ok('fertile window segment present (clarified as lavender in Bloom)');
    else fail('fertile segment missing');
    if (bar.droplet) ok('droplet icon at period start');
    else fail('droplet missing');
    if (bar.heart) ok('heart icon at ovulation day');
    else fail('heart missing');
    // ovulation day 13 -> 0-based idx 12 -> 12/26 = 46.15%
    if (bar.heartLeft !== null && Math.abs(bar.heartLeft - (12 / 26) * 100) < 0.5) ok(`heart at ovulation 46.2% of bar`);
    else fail('heart position wrong: ' + bar.heartLeft);
  }

  // STEP 5 — expand detail: fertile window + next period
  await page.click('[data-testid="cycle-row-2026-07-21"]');
  await page.waitForTimeout(200);
  const detail = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="cycle-detail-2026-07-21"]');
    return el ? el.innerText.replace(/\n/g, ' ') : null;
  });
  if (detail && detail.includes('Fertile window: 28 Jul – 3 Aug') && detail.includes('Next period: 16 Aug')) ok('detail: fertile window 28 Jul – 3 Aug, next period 16 Aug');
  else fail('detail wrong: ' + JSON.stringify(detail));
  await page.screenshot({ path: '/tmp/bloom-trends-expanded.png' });

  // collapse
  await page.click('[data-testid="cycle-row-2026-07-21"]');
  await page.waitForTimeout(150);

  // STEP 6 — back to calendar tab: calendar grid only, no cards
  await page.click('nav[aria-label="Views"] button:has-text("Calendar")');
  await page.waitForTimeout(250);
  const calState = await page.evaluate(() => ({
    scroller: !!document.querySelector('[data-calendar-scroll]'),
    body: document.body.innerText
  }));
  if (calState.scroller) ok('calendar tab shows the calendar grid');
  else fail('calendar grid missing on calendar tab');
  if (!calState.body.toUpperCase().includes('MENSTRUAL HEALTH')) ok('calendar tab has no menstrual health card');
  else fail('calendar tab still shows menstrual health card');
  await page.screenshot({ path: '/tmp/bloom-trends-calendar-back.png' });

  // STEP 7 — health tab: menstrual health card + cycle history, no calendar
  await page.click('nav[aria-label="Views"] button:has-text("Health")');
  await page.waitForTimeout(250);
  const healthText = await page.evaluate(() => document.body.innerText);
  if (healthText.toUpperCase().includes('MENSTRUAL HEALTH') && healthText.includes('Predicted period')) ok('health tab shows menstrual health card');
  else fail('health tab broken: menstrual health card missing');
  if (healthText.toUpperCase().includes('CYCLE HISTORY')) ok('health tab shows cycle history card');
  else fail('health tab broken: cycle history missing');
  if (!healthText.includes('Calendar')) ok('health tab has no calendar');
  else fail('health tab still shows calendar');

  console.log('JS ERRORS:', errors.length ? errors.join(' | ') : 'none');
  if (errors.length) fail('page errors present');
  await browser.close();
  if (process.exitCode) { console.error('E2E FAILED'); process.exit(1); }
  console.log('E2E PASS');
})().catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1); });