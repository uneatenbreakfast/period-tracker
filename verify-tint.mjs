import { chromium } from 'playwright';

const snap = {"version":1,"entries":[{"date":"2012-02-14","symptoms":[],"flow":"medium"},{"date":"2012-02-15","symptoms":[],"flow":"medium"},{"date":"2012-02-16","symptoms":[],"flow":"medium"},{"date":"2012-02-17","symptoms":[],"flow":"medium"},{"date":"2012-02-18","symptoms":[],"flow":"medium"},{"date":"2026-06-17","symptoms":[],"flow":"medium"},{"date":"2026-06-18","symptoms":[],"flow":"medium"},{"date":"2026-08-04","symptoms":["headache"]},{"date":"2026-08-12","symptoms":["mood"]},{"date":"2026-09-18","symptoms":["nausea"]},{"date":"2026-12-23","symptoms":[],"flow":"medium"},{"date":"2026-12-24","symptoms":[],"flow":"medium"},{"date":"2026-12-25","symptoms":[],"flow":"medium"},{"date":"2026-12-26","symptoms":[],"flow":"medium"},{"date":"2026-12-27","symptoms":[],"flow":"medium"},{"date":"2026-12-28","symptoms":[],"flow":"medium"},{"date":"2026-12-29","symptoms":[],"flow":"medium"},{"date":"2026-12-30","symptoms":[],"flow":"medium"},{"date":"2027-01-03","symptoms":[],"flow":"medium"},{"date":"2027-01-04","symptoms":[],"flow":"medium"}],"settings":{"cycleLength":28,"periodLength":5},"updatedAt":"2026-09-01"};

const port = process.argv[2] || '5190';
const outPath = process.argv[3] || '/tmp/bloom-tint-verify.png';

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });

await page.goto(`http://localhost:${port}/`);
await page.waitForTimeout(1500);

// Seed data
await page.evaluate((s) => { localStorage.setItem('bloom.snapshot.v1', JSON.stringify(s)); }, snap);
await page.reload();
await page.waitForTimeout(2500);

// Scroll to show current months (Aug/Sep) for tint verification
await page.evaluate(() => {
  const scrollBox = document.querySelector('[data-calendar-scroll]');
  if (scrollBox) scrollBox.scrollTop = 0;
});
await page.waitForTimeout(500);

await page.screenshot({ path: outPath, fullPage: false });
console.log('Screenshot saved to', outPath);

// Also check computed bg colors for verification
const colors = await page.evaluate(() => {
  const months = ['2026-07', '2026-08', '2026-09'];
  const result = {};
  for (const m of months) {
    const btn = document.querySelector(`button[aria-label="${m}-15"]`);
    if (btn) {
      const cs = window.getComputedStyle(btn);
      result[m] = { bg: cs.backgroundColor, classes: btn.className };
    }
  }
  return result;
});
console.log('Month tint colors:', JSON.stringify(colors, null, 2));

await browser.close();
