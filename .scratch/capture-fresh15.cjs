const { chromium } = require('playwright');

const cycles = [
  { start: '2026-03-15', days: 6 },
  { start: '2026-04-10', days: 5 },
  { start: '2026-05-05', days: 6 },
  { start: '2026-05-31', days: 5 },
  { start: '2026-06-23', days: 5 },
  { start: '2026-07-21', days: 5 },
];
const isoAdd = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 360, height: 880 }, deviceScaleFactor: 1.5 });
  await page.goto('http://localhost:5174/', { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  const seed = [];
  cycles.forEach(({ start, days }) => {
    for (let i = 0; i < days; i++) seed.push({ date: isoAdd(start, i), flow: i % 2 ? 'medium' : 'light', symptoms: [] });
  });
  await page.evaluate((seed) => {
    localStorage.setItem('bloom.snapshot.v1', JSON.stringify({ version: 1, entries: seed, updatedAt: new Date().toISOString() }));
  }, seed);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.click('nav[aria-label="Views"] button:has-text("Trends")');
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/mnt/c/Repos/period-tracker-worktrees/17869649/.scratch/exp-fresh15.png', fullPage: true });
  console.log('saved', (await page.evaluate(() => document.body.scrollHeight)));
  await browser.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });