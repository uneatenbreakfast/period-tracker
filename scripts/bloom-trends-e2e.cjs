// Bloom TrendsCard E2E — seed 6 cycles (reference screens dates), verify stats,
// cycle rows, bar segments + icons, expand detail, tab switch back to calendar.
// Prereq: dev server on :5174 (bun run dev --port 5174), then:
//   NODE_PATH=/mnt/c/Repos/bookmarker/node_modules node bloom-trends-e2e.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
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
  if (tabs.join(',') === 'Calendar,Health,Trends,Settings') ok('tabs CALENDAR | HEALTH | TRENDS | SETTINGS present (uppercased by CSS)');
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
  const badgeCount = await page.evaluate(() => document.querySelectorAll('[data-testid^="cycle-outlier-"]').length);
  if (badgeCount === 0) ok('no outlier badges on normal 6-cycle data');
  else fail('unexpected outlier badges on normal data: ' + badgeCount);

  // STEP 4 — bar segments + icons on newest row (26-day cycle: pink 5d, blue window d7–13, gray tail)
  const bar = await page.evaluate(() => {
    const container = document.querySelector('[data-testid="cycle-bar-2026-07-21"]');
    if (!container) return null;
    const period = container.querySelector('[data-testid="cycle-bar-period"]');
    const fertile = container.querySelector('[data-testid="cycle-bar-fertile"]');
    const droplet = container.querySelector('svg[aria-label="Period start"]');
    const heart = container.querySelector('svg[aria-label="Ovulation day"]');
    const r = container.getBoundingClientRect();
    const pr = period.getBoundingClientRect();
    const fr = fertile.getBoundingClientRect();
    const dr = droplet.getBoundingClientRect();
    const hr = heart.getBoundingClientRect();
    return {
      trackW: r.width,
      trackWpc: parseFloat(container.style.width),
      trackTop: r.top,
      trackH: r.height,
      periodW: parseFloat(period.style.width),
      periodLeftPx: pr.left - r.left,
      periodRightPx: pr.right - r.left,
      fertile: !!fertile,
      fertileLeft: parseFloat(fertile.style.left),
      fertileW: parseFloat(fertile.style.width),
      fertileLeftPx: fr.left - r.left,
      fertileRightPx: fr.right - r.left,
      droplet: !!droplet,
      heart: !!heart,
      dropletCx: dr.left + dr.width / 2 - r.left,
      dropletCy: dr.top + dr.height / 2 - (r.top + r.height / 2),
      heartCx: hr.left + hr.width / 2 - r.left,
      heartCy: hr.top + hr.height / 2 - (r.top + r.height / 2),
    };
  });
  if (!bar) fail('newest cycle bar missing');
  else {
    // rows scale against the longest visible cycle (28d → 26/28 = 92.857%)
    if (Math.abs(bar.trackWpc - (26 / 28) * 100) < 0.5) ok(`track ${bar.trackWpc.toFixed(1)}% of max 28d row`);
    else fail('track width wrong: ' + bar.trackWpc);
    if (Math.abs(bar.periodW - (5 / 26) * 100) < 0.5) ok(`period segment ${bar.periodW.toFixed(1)}% ≈ 5/26`);
    else fail('period segment width wrong: ' + bar.periodW);
    if (bar.fertile) {
      const expectLeft = (7 / 26) * 100;
      const expectW = ((13 - 7) / 26) * 100;
      if (Math.abs(bar.fertileLeft - expectLeft) < 0.5 && Math.abs(bar.fertileW - expectW) < 0.5)
        ok(`fertile segment d7–d13: left ${bar.fertileLeft.toFixed(1)}% width ${bar.fertileW.toFixed(1)}% (Fitbit blue)`);
      else fail(`fertile segment wrong: left ${bar.fertileLeft} width ${bar.fertileW}`);
    } else fail('fertile segment missing');
    if (bar.droplet) {
      // droplet caps the pink segment start, vertically centered on the track
      if (Math.abs(bar.dropletCx - bar.periodLeftPx) < 6 && Math.abs(bar.dropletCy) < 6) ok('droplet at period start, centered on track');
      else fail(`droplet misplaced: cx ${bar.dropletCx.toFixed(1)} cy ${bar.dropletCy.toFixed(1)}`);
    } else fail('droplet missing');
    if (bar.heart) {
      // heart caps the blue segment end (ovulation day 13 = 50% of this 26d track)
      if (Math.abs(bar.heartCx - bar.fertileRightPx) < 6 && Math.abs(bar.heartCy) < 6) ok(`heart at ovulation day (right edge of blue), centered`);
      else fail(`heart misplaced: cx ${bar.heartCx.toFixed(1)} cy ${bar.heartCy.toFixed(1)}`);
    } else fail('heart missing');
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

  // STEP 8 — real user data (bloom-backup.json): 2012 + 2026-06 periods → the
  // 5237-day gap is an outlier: row marked, omitted from averages, no fake prediction
  const backup = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'bloom-backup.json'), 'utf8'));
  await page.evaluate((snap) => localStorage.setItem('bloom.snapshot.v1', JSON.stringify(snap)), backup);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.click('nav[aria-label="Views"] button:has-text("Trends")');
  await page.waitForTimeout(250);

  const outlier = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-testid^="cycle-row-"]')].map((r) => r.innerText.replace(/\n/g, ' '));
    const badges = [...document.querySelectorAll('[data-testid^="cycle-outlier-"]')].map((b) => ({
      id: b.getAttribute('data-testid'),
      text: b.innerText.replace(/\n/g, ' '),
    }));
    const bar = (start) => {
      const el = document.querySelector(`[data-testid="cycle-bar-${start}"]`);
      if (!el) return null;
      return {
        period: !!el.querySelector('[data-testid="cycle-bar-period"]'),
        fertile: !!el.querySelector('[data-testid="cycle-bar-fertile"]'),
        heart: !!el.querySelector('svg[aria-label="Ovulation day"]'),
        trackWpc: parseFloat(el.style.width),
      };
    };
    const get = (id) => {
      const el = document.querySelector(`[data-testid="${id}"]`);
      return el ? el.innerText.replace(/\n/g, ' ') : null;
    };
    return { rows, badges, bar2012: bar('2012-02-14'), bar2026: bar('2026-06-17'), stats: { period: get('stat-period'), ovulation: get('stat-ovulation'), cycle: get('stat-cycle') } };
  });

  if (outlier.rows.length === 2) ok('real data → 2 cycle rows (2012 + 2026-06)');
  else fail('real data row count wrong: ' + outlier.rows.length);
  const oldRow = outlier.rows[1] || '';
  if (oldRow.includes('Period: 5 Days') && oldRow.includes('Ovulation: —') && oldRow.includes('Cycle length: —'))
    ok('outlier row: Period 5 | Ovulation — | Cycle length — (data omitted)');
  else fail('outlier row payload wrong: ' + JSON.stringify(oldRow));
  if (outlier.badges.length === 1 && outlier.badges[0].id === 'cycle-outlier-2012-02-14' && /outlier[\s·]+omitted from averages/i.test(outlier.badges[0].text))
    ok('outlier badge on 2012 row: ' + outlier.badges[0].text);
  else fail('outlier badge wrong: ' + JSON.stringify(outlier.badges));
  if (outlier.bar2012 && outlier.bar2012.period && !outlier.bar2012.fertile && !outlier.bar2012.heart)
    ok('outlier bar: period segment only (no fabricated fertile/heart)');
  else fail('outlier bar wrong: ' + JSON.stringify(outlier.bar2012));
  if (outlier.bar2026 && outlier.bar2026.fertile && outlier.bar2026.heart)
    ok('2026-06 row (latest, not outlier) keeps predicted fertile bar');
  else fail('2026-06 bar wrong: ' + JSON.stringify(outlier.bar2026));
  if (outlier.stats.cycle && outlier.stats.cycle.includes('28') && outlier.stats.cycle.includes('Days'))
    ok('avg cycle length falls back to 28 (5237-day gap excluded)');
  else fail('stat-cycle wrong with real data: ' + JSON.stringify(outlier.stats.cycle));
  if (outlier.stats.ovulation && outlier.stats.ovulation.includes('15th'))
    ok('avg ovulation 15th Day (only the non-outlier row counts)');
  else fail('stat-ovulation wrong with real data: ' + JSON.stringify(outlier.stats.ovulation));

  console.log('JS ERRORS:', errors.length ? errors.join(' | ') : 'none');
  if (errors.length) fail('page errors present');
  await browser.close();
  if (process.exitCode) { console.error('E2E FAILED'); process.exit(1); }
  console.log('E2E PASS');
})().catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1); });