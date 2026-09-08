import { chromium } from 'playwright';
import fs from 'node:fs';
const BASE = process.env.BLOOM_BASE_URL || 'http://localhost:5198/';
const SAVE = JSON.parse(fs.readFileSync('/tmp/bloom-backup-2026-09-08.json', 'utf8'));
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.evaluate((snap) => localStorage.setItem('bloom.snapshot.v1', JSON.stringify(snap)), SAVE);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/final-initial.png' });
  // deep scroll into history (2012)
  for (let i = 0; i < 42; i++) {
    await page.evaluate(() => { document.querySelector('[data-calendar-scroll]').scrollTop = 0; });
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(700);
  await page.screenshot({ path: '/tmp/final-2012.png' });
  // scroll back near today
  await page.evaluate(() => { const s = document.querySelector('[data-calendar-scroll]'); s.scrollTop = s.scrollHeight - 5000; });
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/tmp/final-mid.png' });
  await browser.close();
  console.log('captured');
})();