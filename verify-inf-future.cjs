// Verify infinite future scroll + window-wide predictions on the calendar.
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:5197/';
const pad = (n) => String(n).padStart(2, '0');
const localISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoAdd = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return localISO(dt);
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 400, height: 800 } });

  // Seed 3 logged cycles (28-day), 5-day periods, ending ~60 days ago.
  const today = localISO(new Date());
  const entries = [];
  const endAnchor = isoAdd(today, -60); // last period ends 60 days ago
  // last period start ~64 days ago, then 28-day cycles back.
  const starts = [isoAdd(endAnchor, -68), isoAdd(endAnchor, -40), isoAdd(endAnchor, -12)];
  for (const s of starts) {
    for (let i = 0; i < 5; i++) entries.push({ date: isoAdd(s, i), flow: 'medium', symptoms: [] });
  }
  const snap = { version: 1, entries, settings: { cycleLength: 28, periodLength: 5, showSafeDays: true, style: {} }, updatedAt: today };
  const key = 'bloom.snapshot.v1';

  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [key, JSON.stringify(snap)]);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForTimeout(600);

  const results = {};
  results.legend = await page.evaluate(() => ({
    predicted: !!document.querySelector('[data-legend="predicted"]'),
    fertile: !!document.querySelector('[data-legend="fertile"]'),
    ovulation: !!document.querySelector('[data-legend="ovulation"]'),
    safe: !!document.querySelector('[data-legend="safe"]'),
  }));

  // Count months initially.
  const months0 = await page.evaluate(() =>
    [...document.querySelectorAll('[data-month]')].map((e) => e.getAttribute('data-month')));
  results.initialMonths = months0.length;

  // Dashed predicted cells present in the initial window (near-future month)?
  const nearPred = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('[data-calendar-scroll] button[aria-label]')];
    return btns.filter((b) => b.className.includes('border-dashed')).length;
  });
  results.nearFuturePredictedCells = nearPred;

  // Scroll to the bottom edge repeatedly to trigger future growth.
  let grown = false;
  let monthsAfter = months0;
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => {
      const el = document.querySelector('[data-calendar-scroll]');
      el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(300);
    monthsAfter = await page.evaluate(() =>
      [...document.querySelectorAll('[data-month]')].map((e) => e.getAttribute('data-month')));
    if (monthsAfter.length > months0.length) { grown = true; break; }
  }
  results.grewIntoFuture = grown;
  results.finalMonths = monthsAfter.length;

  // Now verify predictions exist in the FAR future month(s) that were appended.
  const farPred = await page.evaluate(() => {
    // Days 6–12 months ahead of today: predicted period cells should be dashed.
    const today = new Date();
    const btns = [...document.querySelectorAll('[data-calendar-scroll] button[aria-label]')];
    let farDashed = 0;
    let farTotal = 0;
    for (const b of btns) {
      const iso = b.getAttribute('aria-label');
      const d = new Date(iso + 'T00:00:00');
      const aheadMonths = (d.getFullYear() - today.getFullYear()) * 12 + (d.getMonth() - today.getMonth());
      if (aheadMonths >= 6 && aheadMonths <= 14) {
        farTotal++;
        if (b.className.includes('border-dashed')) farDashed++;
      }
    }
    return { farTotal, farDashed };
  });
  results.farFuturePredicted = farPred;

  // Also confirm some dashed predicted cells exist somewhere in the whole grid.
  const totalDashed = await page.evaluate(() =>
    [...document.querySelectorAll('[data-calendar-scroll] button[aria-label]')]
      .filter((b) => b.className.includes('border-dashed')).length);
  results.totalDashedCells = totalDashed;

  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})().catch((e) => { console.error('ERR', e); process.exit(1); });
